"use strict";
import axios from "axios";
import { deepMerge, jsonToQueryString } from "./util";

export class OpenStackClient {
  /**
   * Default constructor.
   *
   * @param {string} url The url of the openstack API
   */
  constructor(url) {
    this.url = url;
  }

  /**
   * Authenticate the user with it's login / password.
   *
   * @param {string} login login of the openstack user
   * @param {string} password password of the openstack user
   */
  async authenticate(login, password) {
    // Init
    this.token = null;
    this.catalog = null;

    // JSON body of the auth query
    const body = {
      auth: {
        identity: {
          methods: ["password"],
          password: {
            user: {
              name: login,
              password: password,
              domain: {
                name: "Default"
              }
            }
          }
        }
      }
    };

    try {
      const response = await this._callApi(
        `${this.url}/auth/tokens`,
        "POST",
        false,
        body
      );
      this.token = {
        value: response.headers["x-subject-token"],
        expired_at: Date.parse(response.data.token.expires_at)
      };
      this.catalog = response.data.token.catalog;
    } catch (e) {
      throw new Error(`Fail to authenticate user ${login}: ${e.message}`);
    }
  }

  /**
   * Compute the region list for the specified service type.
   *
   * @param {string} serviceType Openstack service type (ie. `network`, `compute`, `identity`, `image`, ...)
   * @returns {Promise<Array<{region_id:string, region:string}>>}
   */
  async getRegions(serviceType) {
    // if the catalog property is missing, throw an error
    if (!this.catalog) {
      throw new Error(`Catalog is missing or empty. Did you authenticate ?`);
    }

    // Compute the specified service
    const service = this.catalog
      // Get the endpoint list for the specified service
      .filter(service => {
        return service.type === serviceType;
      })
      .shift();
    if (!service) {
      throw new Error(`The service '${serviceType}' doesn't exist`);
    }

    // construct an array of ID for the distinct part
    const regionIdArray = service.endpoints.map(endpoint => {
      return endpoint.region_id;
    });

    return (
      service.endpoints
        // convert
        .map(endpoint => {
          return { region_id: endpoint.region_id, region: endpoint.region };
        })
        // Distinct
        .filter((value, index) => {
          return regionIdArray.indexOf(value.region_id) === index;
        })
    );
  }

  //
  // ~~~ IMAGES ~~~
  //

  /**
   * Retrieve the list of available images for the specified region.
   *
   * @param {string} regionId The id of openstack region
   * @param {object?} options See https://docs.openstack.org/api-ref/image/v2/index.html?expanded=list-images-detail#id7 for the list of available query string parameters
   * @returns {Promise<Array<Image>>}
   */
  async getImages(regionId, options = {}) {
    const url = this._findEndpoint("image", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/v2/images${jsonToQueryString(options)}`,
        "GET",
        true
      );
      return response.data.images;
    } catch (e) {
      throw new Error(`Fail to retrieve the image list: ${e.message}`);
    }
  }

  //
  // ~~~ COMPUTE FLAVOR ~~~
  //

  /**
   * Retrieve the list of available flavors for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @param {object?} options See https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail,list-servers-detail,list-flavors-detail#id197 for the list of available query string parameters
   * @returns {Promise<Array<Flavor>>}
   */
  async getComputeFlavors(regionId, options = {}) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/flavors${jsonToQueryString(options)}`,
        "GET",
        true
      );
      return await Promise.all(
        response.data.flavors.map(flavor => {
          return this.getComputeFlavor(regionId, flavor.id);
        })
      );
    } catch (e) {
      throw new Error(`Fail to retrieve the compute flavor list: ${e.message}`);
    }
  }

  /**
   * Retrieve the list of available flavors for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @param {string} flavorId Openstack flavor id
   * @returns {Promise<Flavor>}
   */
  async getComputeFlavor(regionId, flavorId) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/flavors/${flavorId}`,
        "GET",
        true
      );
      return response.data.flavor;
    } catch (e) {
      throw new Error(
        `Fail to retrieve detail for flavor ${flavorId}: ${e.message}`
      );
    }
  }

  //
  // ~~~ COMPUTE KEYPAIRS ~~~
  //

  /**
   * Retrieve the list of available SSH keyof the user for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @param {object?} options See https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail,list-servers-detail,list-flavors-detail,list-keypairs-detail#id230 for the list of available query string parameters
   * @returns {Promise<Keypair>}
   */
  async getComputeKeypairs(regionId, options = {}) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/os-keypairs${jsonToQueryString(options)}`,
        "GET",
        true
      );
      return response.data.keypairs.map(item => {
        return item.keypair;
      });
    } catch (e) {
      throw new Error(`Fail to retrieve compute keypair list: ${e.message}`);
    }
  }

  /**
   * Save or create a SSH (and only SSH) key for the user on the compute (ie Nova) service.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name Name of the SSH key to create/save
   * @param {string?} publickey Public SSH key. If omitted, a new key will be created.
   * @returns {Promise<Keypair>}
   */
  async setComputeKeypair(regionId, name, publicKey) {
    // JSON body
    const body = {
      keypair: {
        name: name,
        public_key: publicKey
      }
    };

    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/os-keypairs`,
        "POST",
        true,
        body
      );
      return response.data.keypair;
    } catch (e) {
      throw new Error(`Fail to create/save ssh key ${name}: ${e.message}`);
    }
  }

  /**
   * Delete a SSH (and only SSH) key for the user on the compute (ie Nova) service.
   * if an error occured, an exception is thrown.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name Name of the SSH key to delete
   */
  async deleteComputeKeypair(regionId, name) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/os-keypairs/${name}`,
        "DELETE",
        true
      );
    } catch (e) {
      throw new Error(`Fail to delete ssh key ${name}: ${e.message}`);
    }
  }

  //
  // ~~~ COMPUTE SERVERS ~~~
  //

  /**
   * Retrieve the list of server on the compute service.
   *
   * @param {string} regionId Openstack region id
   * @param {object} options See https://docs.openstack.org/api-ref/compute/?expanded=list-servers-detail#list-servers-request for the list of available query string parameters
   * @returns {Promise<Array<Server>>} List of server ()
   */
  async getComputeServers(regionId, options) {
    try {
      const url = this._findEndpoint("compute", regionId, "public");
      const response = await this._callApi(
        `${url}/servers/detail${jsonToQueryString(options)}`,
        "GET",
        true
      );
      return response.data.servers;
    } catch (e) {
      throw new Error(`Fail to retrieve the compute server list: ${e.message}`);
    }
  }

  /**
   * Create a compute server.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name Name of the server
   * @param {string} imageId Openstack image ID
   * @param {string} flavorId Openstack flavor ID
   * @param {object} options Optionals parameters for the server creation (@see https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail#id11)
   * @returns {Promise<Server>} Created server (@see https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail,list-servers-detail,list-flavors-detail,list-keypairs-detail,add-associate-floating-ip-addfloatingip-action-deprecated-detail,pause-server-pause-action-detail,reboot-server-reboot-action-detail#id12 )
   */
  async createComputeServer(regionId, name, imageId, flavorId, options = {}) {
    const body = {
      server: {
        name: name,
        imageRef: imageId,
        flavorRef: flavorId
      }
    };
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/servers`,
        "POST",
        true,
        deepMerge(body, { server: options })
      );
      return response.data.server;
    } catch (e) {
      throw new Error(`Fail to create compute server ${name}: ${e.message}`);
    }
  }

  /**
   * Retrieve a compute server by its ID.
   * For the response type @see https://docs.openstack.org/api-ref/compute/?expanded=list-servers-detail,show-server-details-detail#id30
   *
   * @param {string} regionId Openstack region id
   * @param {string} serverId Openstack server ID
   * @returns {Promise<Server>} Created server
   */
  async getComputeServer(regionId, serverId) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/servers/${serverId}`,
        "GET",
        true
      );
      return response.data.server;
    } catch (e) {
      throw new Error(
        `Fail to get detail of compute server ${serverId}: ${e.message}`
      );
    }
  }

  /**
   * Delete a compute server by its ID.
   *
   * @param {string} regionId Openstack region id
   * @param {string} serverId Openstack server ID
   */
  async deleteComputeServer(regionId, serverId) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/servers/${serverId}`,
        "DELETE",
        true
      );
    } catch (e) {
      throw new Error(
        `Fail to delete compute server ${serverId}: ${e.message}`
      );
    }
  }

  /**
   * Perfoms the action on the compute server.
   *
   * @param {string} regionId Openstack region id
   * @param {string} serverId Openstack compute server id
   * @param {object} actionBody The action body to add to the API call
   * @throws {Error} if the action is not performed
   */
  async actionComputeServer(regionId, serverId, actionBody) {
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      const response = await this._callApi(
        `${url}/servers/${serverId}/action`,
        "POST",
        true,
        actionBody
      );
    } catch (e) {
      throw new Error(
        `Failed to exec action ${actionBody} on server ${serverid}`
      );
    }
  }

  async startComputeServer(regionId, serverId) {
    actionComputeServer(regionId, serverId, { "os-stop": null });
  }

  async stopComputeServer(regionId, serverId) {
    actionComputeServer(regionId, serverId, { "os-stop": null });
  }

  async rebootComputeServer(regionId, serverId, rebootType = "SOFT") {
    actionComputeServer(regionId, serverId, { reboot: { type: rebootType } });
  }

  async suspendComputeServer(regionId, serverId) {
    actionComputeServer(regionId, serverId, { suspend: null });
  }

  async resumeComputeServer(regionId, serverId) {
    actionComputeServer(regionId, serverId, { resume: null });
  }

  async pauseComputeServer(regionId, serverId) {
    actionComputeServer(regionId, serverId, { pause: null });
  }

  async unpauseComputeServer(regionId, serverId) {
    actionComputeServer(regionId, serverId, { unpause: null });
  }

  /**
   * Make a HTTP call the OpenStack endpoint.
   *
   * @param {string} url API endpoint url
   * @param {string} method HTTP method
   * @param {boolean} auth Is endpoint requires auth ?
   * @param {string} body HTTP body of the call
   * @returns {Promise<AxiosResponse>} The axios response
   * @throws {Error} If an error occured (ie. the code is not a 20X)
   */
  async _callApi(url, method, auth, body) {
    const headers = {
      "Content-Type": "application/json"
    };
    if (auth) {
      if (!this.token) {
        throw new Error("Not authenticated");
      }
      if (this.token.expired_at < Date.now()) {
        throw new Error("Token is expired");
      }
      headers["X-Auth-Token"] = this.token.value;
    }
    try {
      const response = await axios({
        url: url,
        method: method,
        headers: headers,
        responseType: "json",
        data: body
      });
      return response;
    } catch (e) {
      throw new Error(
        `API returns ${e.response.status} - ${JSON.stringify(e.response.data)}`
      );
    }
  }

  /**
   * Find the endpoint url for the specified service, region and type.
   *
   * @param {string} serviceType The openstack service type (ie. `network`, `compute`, `identity`, `image`, ...)
   * @param {string} regionId The id of the region
   * @param {string} type The interface of the endpoint (ie. `internal`, `admin` or `public`)
   * @returns {string} The endpoint url
   */
  _findEndpoint(serviceType, regionId, type) {
    // Get the specified service
    const service = this.catalog
      // Get the endpoint list for the specified service
      .filter(service => {
        return service.type === serviceType;
      })
      .shift();
    if (!service) {
      throw new Error(`The service '${serviceType}' doesn't exist`);
    }
    // Find the endpoint for type and regionId
    const endpoint = service.endpoints
      .filter(endpoint => {
        return endpoint.interface === type && endpoint.region_id === regionId;
      })
      .shift();

    if (!endpoint) {
      throw new Error(
        `There is no ${regionId} / ${type} endpoint for service ${serviceType}`
      );
    }

    return endpoint.url;
  }
}
