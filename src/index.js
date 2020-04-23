import axios from "axios";
import { OpenStackError } from "./error";
import { deepMerge, jsonToQueryString } from "./util";
import script from "./shell/script.sh";

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
   * @param {string} login Login of the openstack user
   * @param {string} password Password of the openstack user
   * @param {string?} domain Domain of the openstack user. By default it's `Default`.
   * @param {string?} project Openstack project name
   * @throws {OpenStackError}
   */
  async authenticate(login, password, domain = "Default", project = null) {
    // Init
    this.token = null;
    this.catalog = null;
    this.project = null;

    // check params
    this._checkStringRequiredField("login", login);
    this._checkStringRequiredField("password", login);

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
                name: domain,
              },
            },
          },
        },
      },
    };
    if (project) {
      body.auth.scope = {
        project: {
          name: project,
          domain: { name: domain },
        },
      };
    }

    try {
      // make the api call
      const response = await this._callApi(`${this.url}/auth/tokens`, "POST", false, body);

      // Save token
      this.token = {
        value: response.headers["x-subject-token"],
        expired_at: Date.parse(response.data.token.expires_at),
      };
      this.project = response.data.token.project;

      // register the catalog
      if (response.data.token.catalog) {
        this.catalog = response.data.token.catalog;
      } else {
        await this.getCatalog();
      }
    } catch (e) {
      throw new OpenStackError(`Fail to authenticate user ${login}`, e);
    }
  }

  /**
   * Retrieve the catalog of the OpenStack API and set it on the client.
   * This method is used in the auth process.
   *
   * @throws {OpenStackError}
   */
  async getCatalog() {
    try {
      const response = await this._callApi(`${this.url}/auth/catalog`, "GET", true);
      this.catalog = response.data.catalog;
    } catch (e) {
      throw new OpenStackError(`Fail to retrieve the catalog`, e);
    }
  }

  /**
   * Compute the region list for the specified service type.
   *
   * @param {string} serviceType Openstack service type (ie. `network`, `compute`, `identity`, `image`, ...)
   * @returns {Promise<Array<{region_id:string, region:string}>>}
   * @throws {OpenStackError}
   */
  async getRegions(serviceType) {
    // check params
    this._checkStringRequiredField("serviceType", serviceType);

    // if the catalog property is missing, throw an error
    if (!this.catalog) {
      throw new OpenStackError(`Catalog is missing or empty. Did you authenticate ?`);
    }

    // Compute the specified service
    const service = this.catalog
      // Get the endpoint list for the specified service
      .filter(service => {
        return service.type === serviceType;
      })
      .shift();
    if (!service) {
      throw new OpenStackError(`The service '${serviceType}' doesn't exist`);
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
  // ~~~ IMAGES - images ~~~
  //

  /**
   * Retrieve the list of available images for the specified region.
   *
   * @param {string} regionId The id of openstack region
   * @param {object?} options See https://docs.openstack.org/api-ref/image/v2/index.html?expanded=list-images-detail#id7 for the list of available query string parameters
   * @returns {Promise<Array<Image>>}
   * @throws {OpenStackError}
   */
  async getImages(regionId, options = {}) {
    return await this._openstackCall(
      regionId,
      "image",
      "GET",
      `/v2/images${jsonToQueryString(options)}`,
      true,
      "images",
    );
  }

  //
  // ~~~ COMPUTE - FLAVOR ~~~
  // @see https://docs.openstack.org/api-ref/compute/#list-flavors
  //

  /**
   * Retrieve the list of available flavors for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @param {object?} options See https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail,list-servers-detail,list-flavors-detail#id197 for the list of available query string parameters
   * @returns {Promise<Array<Flavor>>}
   * @throws {OpenStackError}
   */
  async getComputeFlavors(regionId, options = {}) {
    const flavors = await this._openstackCall(
      regionId,
      "compute",
      "GET",
      `/flavors${jsonToQueryString(options)}`,
      true,
      "flavors",
    );
    return await Promise.all(
      flavors.map(flavor => {
        return this.getComputeFlavor(regionId, flavor.id);
      }),
    );
  }

  /**
   * Retrieve the list of available flavors for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @param {string} flavorId Openstack flavor id
   * @returns {Promise<Flavor>}
   * @throws {OpenStackError}
   */
  async getComputeFlavor(regionId, flavorId) {
    return await this._openstackCall(regionId, "compute", "GET", `/flavors/${flavorId}`, true, "flavor");
  }

  //
  // ~~~ COMPUTE - Keypairs ~~~
  // @see https://docs.openstack.org/api-ref/compute/#keypairs-keypairs
  //

  /**
   * Retrieve the list of available SSH keyof the user for Nova (ie. compute).
   *
   * @param {string} regionId Openstack region id
   * @param {object?} options See https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail,list-servers-detail,list-flavors-detail,list-keypairs-detail#id230 for the list of available query string parameters
   * @returns {Promise<Keypair>}
   * @throws {OpenStackError}
   */
  async getComputeKeypairs(regionId, options = {}) {
    const keypairs = await this._openstackCall(
      regionId,
      "compute",
      "GET",
      `/os-keypairs${jsonToQueryString(options)}`,
      true,
      "keypairs",
    );
    return keypairs.map(item => {
      return item.keypair;
    });
  }

  /**
   * Save or create a SSH (and only SSH) key for the user on the compute (ie Nova) service.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name Name of the SSH key to create/save
   * @param {string?} publickey Public SSH key. If omitted, a new key will be created.
   * @returns {Promise<Keypair>}
   * @throws {OpenStackError}
   */
  async setComputeKeypair(regionId, name, publicKey) {
    // check params
    this._checkStringRequiredField("name", name);
    // make the api call
    return await this._openstackCall(regionId, "compute", "POST", `/os-keypairs`, true, "keypair", {
      name: name,
      public_key: publicKey,
    });
  }

  /**
   * Delete a SSH (and only SSH) key for the user on the compute (ie Nova) service.
   * if an error occured, an exception is thrown.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name Name of the SSH key to delete
   * @throws {OpenStackError}
   */
  async deleteComputeKeypair(regionId, name) {
    // check params
    this._checkStringRequiredField("name", name);
    // make the api call
    await this._openstackCall(regionId, "compute", "DELETE", `/os-keypairs/${name}`, true);
  }

  //
  // ~~~ COMPUTE - Servers ~~~
  // @see https://docs.openstack.org/api-ref/compute/#servers-servers
  //

  /**
   * Retrieve the list of server on the compute service.
   *
   * @param {string} regionId Openstack region id
   * @param {object} options See https://docs.openstack.org/api-ref/compute/?expanded=list-servers-detail#list-servers-request for the list of available query string parameters
   * @returns {Promise<Array<Server>>} List of server ()
   * @throws {OpenStackError}
   */
  async getComputeServers(regionId, options) {
    return await this._openstackCall(
      regionId,
      "compute",
      "GET",
      `/servers/detail${jsonToQueryString(options)}`,
      true,
      "servers",
    );
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
  async createComputeServer(regionId, name, imageId, flavorId, server = {}) {
    // check params
    this._checkStringRequiredField("name", name);
    this._checkStringRequiredField("imageId", imageId);
    this._checkStringRequiredField("flavorId", flavorId);

    // min server config
    const serverMini = {
      name: name,
      imageRef: imageId,
      flavorRef: flavorId,
    };

    // make the api call
    return await this._openstackCall(
      regionId,
      "compute",
      "POST",
      `/servers`,
      true,
      "server",
      deepMerge(serverMini, server),
    );
  }

  /**
   * Retrieve a compute server by its ID.
   * For the response type @see https://docs.openstack.org/api-ref/compute/?expanded=list-servers-detail,show-server-details-detail#id30
   *
   * @param {string} regionId Openstack region id
   * @param {string} serverId Openstack server ID
   * @returns {Promise<Server>} Created server
   * @throws {OpenStackError}
   */
  async getComputeServer(regionId, serverId) {
    // check params
    this._checkStringRequiredField("serverId", serverId);
    // make the api call
    return await this._openstackCall(regionId, "compute", "GET", `/servers/${serverId}`, true, "server");
  }

  /**
   * Retrieve a compute server ip.
   *
   * @param {string} regionId Openstack region id
   * @param {string} serverId Openstack server ID
   * @returns {Promise<Array<Addresses>>} Lits of ip addresses
   * @throws {OpenStackError}
   */
  async getComputeServerIp(regionId, serverId) {
    // check params
    this._checkStringRequiredField("serverId", serverId);
    // make the api call
    return await this._openstackCall(regionId, "compute", "GET", `/servers/${serverId}/ips`, true, "addresses");
  }

  /**
   * Delete a compute server by its ID.
   *
   * @param {string} regionId Openstack region id
   * @param {string} serverId Openstack server ID
   * @throws {OpenStackError}
   */
  async deleteComputeServer(regionId, serverId) {
    // check params
    this._checkStringRequiredField("serverId", serverId);
    // make the api call
    await this._openstackCall(regionId, "compute", "DELETE", `/servers/${serverId}`, true);
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
    // check params
    this._checkStringRequiredField("serverId", serverId);

    // make the api call
    const url = this._findEndpoint("compute", regionId, "public");
    try {
      await this._callApi(`${url}/servers/${serverId}/action`, "POST", true, actionBody);
    } catch (e) {
      throw new Error(`Failed to exec action ${actionBody} on server ${serverId}: ${e.message}`);
    }
  }

  async startComputeServer(regionId, serverId) {
    await this.actionComputeServer(regionId, serverId, { "os-start": null });
  }

  async stopComputeServer(regionId, serverId) {
    await this.actionComputeServer(regionId, serverId, { "os-stop": null });
  }

  async rebootComputeServer(regionId, serverId, rebootType = "SOFT") {
    await this.actionComputeServer(regionId, serverId, {
      reboot: { type: rebootType },
    });
  }

  async suspendComputeServer(regionId, serverId) {
    await this.actionComputeServer(regionId, serverId, { suspend: null });
  }

  async resumeComputeServer(regionId, serverId) {
    await this.actionComputeServer(regionId, serverId, { resume: null });
  }

  async pauseComputeServer(regionId, serverId) {
    await this.actionComputeServer(regionId, serverId, { pause: null });
  }

  async unpauseComputeServer(regionId, serverId) {
    await this.actionComputeServer(regionId, serverId, { unpause: null });
  }

  //
  // ~~~ NETWORK (neutron)- Networks (https://docs.openstack.org/api-ref/network/v2/index.html#networks) ~~~
  //

  /**
   * Get all the networks.
   *
   * @param {string} regionId Openstack region id
   * @param {object} options Options for querying networks.
   * @returns {Promise<Array<Network>>}
   * @throws {OpenStackError}
   */
  async getNetworkNetworks(regionId, options = {}) {
    const networks = await this._openstackCall(
      regionId,
      "network",
      "GET",
      `/v2.0/networks${jsonToQueryString(options)}`,
      true,
      "networks",
    );
    return await Promise.all(
      networks.map(network => {
        return this.getNetworkNetwork(regionId, network.id);
      }),
    );
  }

  /**
   * Get a network by its id.
   *
   * @param {string} regionId Openstack region id
   * @param {string} networkId OpenStack network id
   * @returns {Promise<Network>}
   * @throws {OpenStackError}
   */
  async getNetworkNetwork(regionId, networkId) {
    // check params
    this._checkStringRequiredField("networkId", networkId);
    // make api call
    return await this._openstackCall(regionId, "network", "GET", `/v2.0/networks/${networkId}`, true, "network");
  }

  /**
   * Create a network.
   *
   * @param {string} regionId Openstack region id
   * @param {object} network OpenStack network object (@see https://docs.openstack.org/api-ref/network/v2/index.html?expanded=create-network-detail#id22)
   * @returns {Promise<Network>}
   * @throws {OpenStackError}
   */
  async createNetworkNetwork(regionId, network) {
    return await this._openstackCall(regionId, "network", "POST", `/v2.0/networks`, true, "network", network);
  }

  /**
   * Delete a network.
   *
   * @param {string} regionId Openstack region id
   * @param {string} networkId OpenStack network id
   * @throws {OpenStackError}
   */
  async deleteNetworkNetwork(regionId, networkId) {
    await this._openstackCall(regionId, "network", "DELETE", `/v2.0/networks/${networkId}`, true);
  }

  //
  // ~~~ NETWORK (neutron)- Subnets ~~~
  // @see https://docs.openstack.org/api-ref/network/v2/index.html#subnets
  //

  /**
   * Get all the subnets.
   *
   * @param {string} regionId Openstack region id
   * @param {object} options Options for querying subnets.
   * @returns {Promise<Array<Subnet>>}
   * @throws {OpenStackError}
   */
  async getNetworkSubnets(regionId, options = {}) {
    return await this._openstackCall(
      regionId,
      "network",
      "GET",
      `/v2.0/subnets${jsonToQueryString(options)}`,
      true,
      "subnets",
    );
  }

  /**
   * Get a subnet by its id.
   *
   * @param {string} regionId Openstack region id
   * @param {string} subnetId OpenStack subnet id
   * @returns {Promise<Subnet>}
   * @throws {OpenStackError}
   */
  async getNetworkSubnet(regionId, subnetId) {
    // check params
    this._checkStringRequiredField("subnetId", subnetId);
    // make api call
    return await this._openstackCall(regionId, "network", "GET", `/v2.0/subnets/${subnetId}`, true, "subnet");
  }

  /**
   * Create a subnet.
   *
   * @param {string} regionId Openstack region id
   * @param {string} networkId Openstack networkId for the subnet
   * @param {string} ipVersion Openstack ipVersion for the subnet
   * @param {string} cidr Openstack cidr for the subnet
   * @param {object} subnet OpenStack subnet object.
   * @returns {Promise<Subnet>}
   * @throws {OpenStackError}
   */
  async createNetworkSubnet(regionId, networkId, ipVersion, cidr, subnet) {
    // check params
    this._checkStringRequiredField("networkId", networkId);
    // make api call
    return await this._openstackCall(
      regionId,
      "network",
      "POST",
      `/v2.0/subnets`,
      true,
      "subnet",
      deepMerge({ network_id: networkId, ip_version: ipVersion, cidr: cidr }, subnet),
    );
  }

  /**
   * Delete a subnet by its id.
   *
   * @param {string} regionId Openstack region id
   * @param {string} subnetId OpenStack subnet id
   * @throws {OpenStackError}
   */
  async deleteNetworkSubnet(regionId, subnetId) {
    // check params
    this._checkStringRequiredField("subnetId", subnetId);
    // make api call
    await this._openstackCall(regionId, "network", "DELETE", `/v2.0/subnets/${subnetId}`, true, "subnet");
  }

  //
  // ~~~ NETWORK (neutron)- Security group  ~~~
  // @see https://docs.openstack.org/api-ref/network/v2/index.html#security-groups-security-groups
  //

  /**
   * Get all security groups
   *
   * @param {string} regionId Openstack region id
   * @param {object} options Options for querying
   * @returns {Promise<Array<SecurityGroup>>}
   * @throws {OpenStackError}
   */
  async getNetworkSecurityGroups(regionId, options = {}) {
    return await this._openstackCall(
      regionId,
      "network",
      "GET",
      `/v2.0/security-groups${jsonToQueryString(options)}`,
      true,
      "security_groups",
    );
  }

  /**
   * Get a security group by its id
   *
   * @param {string} regionId Openstack region id
   * @param {string} securityGroupId Openstack security group id
   * @returns {Promise<SecurityGroup>}
   * @throws {OpenStackError}
   */
  async getNetworkSecurityGroup(regionId, securityGroupId) {
    // check params
    this._checkStringRequiredField("securityGroupId", securityGroupId);
    // make api call
    return await this._openstackCall(
      regionId,
      "network",
      "GET",
      `/v2.0/security-groups/${securityGroupId}`,
      true,
      "security_group",
    );
  }

  /**
   * Create a Security group.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name name of the security group
   * @param {object} securityGroup OpenStack SecurityGroup object (@see https://docs.openstack.org/api-ref/network/v2/index.html?expanded=create-security-group-detail#id371)
   * @returns {Promise<SecurityGroup>}
   * @throws {OpenStackError}
   */
  async createNetworkSecurityGroup(regionId, name, securityGroup = {}) {
    // check params
    this._checkStringRequiredField("name", name);
    // make api call
    return await this._openstackCall(
      regionId,
      "network",
      "POST",
      `/v2.0/security-groups`,
      true,
      "security_group",
      deepMerge({ name: name }, securityGroup),
    );
  }

  /**
   * Delete a Security group.
   *
   * @param {string} regionId Openstack region id
   * @param {string} name name of the security group
   * @param {string} securityGroupId Openstack security group id
   * @throws {OpenStackError}
   */
  async deleteNetworkSecurityGroup(regionId, securityGroupId) {
    // check params
    this._checkStringRequiredField("securityGroupId", securityGroupId);
    // make api call
    await this._openstackCall(regionId, "network", "DELETE", `/v2.0/security-groups/${securityGroupId}`, true);
  }

  //
  // ~~~ NETWORK (neutron)- Security group rules  ~~~
  // @see https://docs.openstack.org/api-ref/network/v2/index.html?#security-group-rules-security-group-rules
  //

  /**
   * Create a Security group rule.
   *
   * @param {string} regionId Openstack region id
   * @param {string} securityGroupid OpenStack SecurityGroup id
   * @param {object} rule OpenStack SecurityGroupRule object (@see https://docs.openstack.org/api-ref/network/v2/index.html?&expanded=create-security-group-rule-detail#id357)
   * @returns {Promise<SecurityGroup>}
   * @throws {OpenStackError}
   */
  async createNetworkSecurityGroupRule(regionId, securityGroupId, rule) {
    // check params
    this._checkStringRequiredField("securityGroupId", securityGroupId);
    // make api call
    return await this._openstackCall(
      regionId,
      "network",
      "POST",
      `/v2.0/security-group-rules`,
      true,
      "security_group_rule",
      deepMerge({ security_group_id: securityGroupId }, rule),
    );
  }

  //
  // ~~~ 'HYPHE' SPECIFIC METHODS  ~~~
  //

  /**
   * Deploy a hyphe instance.
   * In the config object :
   *  - image is the name of the image
   *  - flavor is the ID of the flavor
   *
   * @param {string} regionId Openstack region id
   * @param {object} config Configuration object `{ image: string, flavor: string, ssh: {name: string, key?: string}, disk?: number, serverName?: string, hyphe_config:{[key:string]:any} }`
   * @returns {Promise<Server>} Created server (@see https://docs.openstack.org/api-ref/compute/?expanded=create-server-detail,list-servers-detail,list-flavors-detail,list-keypairs-detail,add-associate-floating-ip-addfloatingip-action-deprecated-detail,pause-server-pause-action-detail,reboot-server-reboot-action-detail#id12 )
   */
  async hypheDeploy(regionId, config) {
    // Checking configuration object
    this._checkStringRequiredField("image in config", config.image);
    this._checkStringRequiredField("flavor in config", config.flavor);
    this._checkStringRequiredField("ssh name in config", config.ssh.name);

    // Step 1 : Searching image from the name
    const images = await this.getImages(regionId, { name: config.image });
    const image = images.shift();
    if (!image) {
      throw new OpenStackError(`Fail to find image with name ${config.image}`);
    }

    // Step 2 : Searching the flavor
    const flavor = await this.getComputeFlavor(regionId, config.flavor);
    if (!flavor) {
      throw new OpenStackError(`Fail to find flavor with name ${config.flavor}`);
    }
    if (flavor.disk === 0 && !config.disk) {
      throw new OpenStackError(`Field disk in config is required when a flavor has no disk`);
    }

    // Step 3 : Create SSH key if needed
    const sshKeys = await this.getComputeKeypairs(regionId);
    let sshKey = sshKeys
      .filter(item => {
        return item.name === config.ssh.name;
      })
      .shift();
    if (!sshKey) {
      sshKey = await this.setComputeKeypair(regionId, config.ssh.name, config.ssh.key);
    }

    // Step 4 : create a security group with valid rules
    const securityGroupName = "hyphe-security-rules";
    let securityGroup = (await this.getNetworkSecurityGroups(regionId))
      .filter(group => {
        return group.name === securityGroupName;
      })
      .shift();
    if (!securityGroup) {
      securityGroup = await this.createNetworkSecurityGroup(regionId, securityGroupName);
      // Create Security rules
      await this.createNetworkSecurityGroupRule(regionId, securityGroup.id, {
        direction: "ingress",
        port_range_min: "80",
        ethertype: "IPv4",
        port_range_max: "81",
        protocol: "tcp",
        description: "http",
      });
      await this.createNetworkSecurityGroupRule(regionId, securityGroup.id, {
        direction: "ingress",
        port_range_min: "443",
        ethertype: "IPv4",
        port_range_max: "443",
        protocol: "tcp",
        description: "https",
      });
      await this.createNetworkSecurityGroupRule(regionId, securityGroup.id, {
        direction: "ingress",
        port_range_min: "22",
        ethertype: "IPv4",
        port_range_max: "22",
        protocol: "tcp",
        description: "ssh",
      });
    }

    // Step 5 : Shell script
    let deployScript = script;
    if (config.hyphe_config) {
      const hypheConfig = Object.keys(config.hyphe_config)
        .map(key => {
          return `echo "export ${key}=${config.hyphe_config[key]}" >> hyphe.env`;
        })
        .join("\n");
      deployScript = script.replace("# @@_HYPHE_CONFIG_@@", hypheConfig);
    }
    const content64 = Buffer.from(deployScript).toString("base64");

    // Step 6 : Create the server
    let options = {
      key_name: sshKey.name,
      user_data: content64,
      security_groups: [{ name: securityGroup.name }],
    };
    if (flavor.disk === 0) {
      options["block_device_mapping_v2"] = [
        {
          uuid: image.id,
          source_type: "image",
          destination_type: "volume",
          boot_index: 0,
          volume_size: config.disk,
        },
      ];
    }
    return await this.createComputeServer(regionId, config.serverName || "hyphe-server", image.id, flavor.id, options);
  }

  //
  // ~~~ 'PRIVATE' METHODS  ~~~
  //

  /**
   * Generic method to exchange with the openstack API.
   *
   * @param {string} regionId Openstack region id
   * @param {string} service Openstack service name (ie. compute, server, ...)
   * @param {string} method The http method to perform
   * @param {string} path OpenStack path to call for the service
   * @param {boolean} auth Is endpoint requires auth ?
   * @param {string} objectName Name of the object we send to the API (and the API respond)
   * @param {string} object The object we send to the api
   * @returns {Promise<object>} The response of the api (only what we need, so the objectName)
   * @throws {OpenStackError}
   */
  async _openstackCall(regionId, service, method, path, auth = true, objectName, object) {
    // check params
    this._checkStringRequiredField("regionId", regionId);

    // find the endpoint
    const url = this._findEndpoint(service, regionId, "public");

    // Construct the http body if needed
    let data;
    if (objectName && object != undefined) {
      data = {};
      data[objectName] = object;
    }

    // make the call and parse the response
    try {
      const response = await this._callApi(`${url}${path}`, method, auth, data);
      if (response.data) {
        return response.data[objectName];
      } else {
        return null;
      }
    } catch (e) {
      throw new OpenStackError(`Failed to ${method} on ${path} for service ${service} `, e);
    }
  }

  /**
   * Make a HTTP call the OpenStack endpoint.
   *
   * @param {string} url API endpoint url
   * @param {string} method HTTP method
   * @param {boolean} auth Is endpoint requires auth ?
   * @param {string} body HTTP body of the call
   * @returns {Promise<AxiosResponse>} The axios response
   * @throws {AxiosError} If an error occured (ie. the code is not a 20X)
   */
  async _callApi(url, method, auth, body) {
    // deafult header
    const headers = {
      "Content-Type": "application/json",
    };

    // do we need authentification ?
    if (auth) {
      if (!this.token) {
        throw new Error("Not authenticated");
      }
      if (this.token.expired_at < Date.now()) {
        throw new Error("Token is expired");
      }
      headers["X-Auth-Token"] = this.token.value;
    }

    // make the http call
    const response = await axios({
      url: url,
      method: method,
      headers: headers,
      responseType: "json",
      data: body,
    });
    return response;
  }

  /**
   * Find the endpoint url for the specified service, region and type.
   *
   * @param {string} serviceType The openstack service type (ie. `network`, `compute`, `identity`, `image`, ...)
   * @param {string} regionId The id of the region
   * @param {string} type The interface of the endpoint (ie. `internal`, `admin` or `public`)
   * @returns {string} The endpoint url
   * @throws {OpenStackError}
   */
  _findEndpoint(serviceType, regionId, type) {
    // check params
    this._checkStringRequiredField("serviceType", serviceType);
    this._checkStringRequiredField("regionId", regionId);

    if (!this.catalog) {
      throw new OpenStackError(`Catalog is missing or empty. Did you authenticate ?`);
    }

    // Get the endpoint list for the specified service
    const service = this.catalog
      .filter(service => {
        return service.type === serviceType;
      })
      .shift();
    if (!service) {
      throw new OpenStackError(`The service '${serviceType}' doesn't exist`);
    }

    // Find the endpoint for type and regionId
    const endpoint = service.endpoints
      .filter(endpoint => {
        return endpoint.interface === type && endpoint.region_id === regionId;
      })
      .shift();

    if (!endpoint) {
      throw new OpenStackError(`There is no ${regionId} / ${type} endpoint for service ${serviceType}`);
    }

    return endpoint.url;
  }

  /**
   * Check if the named field  is null or empty.
   * If so, an error is thrown.
   *
   * @param {string} name  Name of the field (use in the error)
   * @param {string} vale Value of the field.
   * @throws {OpenStackError}
   */
  _checkStringRequiredField(name, value) {
    if (value === undefined || value.trim() === "") {
      throw new OpenStackError(`Field ${name} is required`);
    }
  }
}
