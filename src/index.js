"use strict";
import axios from "axios";

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
      const response = await axios({
        url: `${this.url}/auth/tokens`,
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        data: body,
        responseType: "json"
      });
      this.token = response.headers["x-subject-token"];
      this.catalog = response.data.token.catalog;
    } catch (e) {
      throw new Error("Failed to authenticate the user", e);
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
      throw new Error(
        "Catalog is missing or empty. You should call the `authenticate` method before"
      );
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

  /**
   * Retrieve the list of available images for the specified region.
   *
   * @param {string} regionId The id of openstack region
   * @returns {Promise<Array<Image>>}
   */
  async getImages(regionId) {
    try {
      const url = this._findEndpoint("image", regionId, "public");

      //TODO: Make a get version instead of suffix with v2
      const response = await axios({
        url: `${url}/v2/images`,
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": this.token
        },
        responseType: "json"
      });
      return response.data.images;
    } catch (e) {
      throw new Error("Failed to retrieve the image list", e);
    }
  }

  /**
   * Retrieve the list of available flavors for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @returns {Promise<Array<Flavor>>}
   */
  async getComputeFlavors(regionId) {
    try {
      const url = this._findEndpoint("compute", regionId, "public");
      const response = await axios({
        url: `${url}/flavors`,
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": this.token
        },
        responseType: "json"
      });

      return await Promise.all(
        response.data.flavors.map(flavor => {
          return this.getComputeFlavor(regionId, flavor.id);
        })
      );
    } catch (e) {
      throw new Error("Failed to retrieve the compute flavor list", e);
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
    try {
      const url = this._findEndpoint("compute", regionId, "public");
      const response = await axios({
        url: `${url}/flavors/${flavorId}`,
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": this.token
        },
        responseType: "json"
      });
      return response.data.flavor;
    } catch (e) {
      throw new Error("Failed to retrieve the compute flavor detail", e);
    }
  }

  /**
   * Retrieve the list of available SSH keyof the user for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @returns {Promise<Keypair>}
   */
  async getComputeKeypairs(regionId) {
    try {
      const url = this._findEndpoint("compute", regionId, "public");
      const response = await axios({
        url: `${url}/os-keypairs`,
        method: "GET",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": this.token
        },
        responseType: "json"
      });
      return response.data.keypairs;
    } catch (e) {
      throw new Error("Failed to retrieve the compute keypair list", e);
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

    try {
      const url = this._findEndpoint("compute", regionId, "public");
      const response = await axios({
        url: `${url}/os-keypairs`,
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": this.token
        },
        responseType: "json",
        data: body
      });
      return response.data.keypair;
    } catch (e) {
      throw new Error("Failed to retrieve the compute keypair list", e);
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
    try {
      const url = this._findEndpoint("compute", regionId, "public");
      const response = await axios({
        url: `${url}/os-keypairs/${name}`,
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          "X-Auth-Token": this.token
        },
        responseType: "json"
      });
    } catch (e) {
      throw new Error("Failed to retrieve the compute keypair list", e);
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
        `There is no ${regionId} / ${type} endpoint in service ${serviceType}`
      );
    }

    return endpoint.url;
  }
}
