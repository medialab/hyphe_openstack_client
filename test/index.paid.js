import chai from "chai";
import * as fs from "fs";
import { OpenStackClient } from "../src/index";

chai.expect();
const assert = chai.assert;

const OPENSTACK_URL = process.env.OPENSTACK_URL;
const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;
const OPENSTACK_DOMAIN = process.env.OPENSTACK_DOMAIN;
const OPENSTACK_PROJECT = process.env.OPENSTACK_PROJECT;
const OPENSTACK_REGION = process.env.OPENSTACK_REGION;
const OPENSTACK_IMAGE = process.env.OPENSTACK_IMAGE;
const OPENSTACK_FLAVOR = process.env.OPENSTACK_FLAVOR;
const OPENSTACK_SSHKEY_NAME = process.env.OPENSTACK_SSHKEY_NAME;
const OPENSTACK_SSHKEY_PUB = process.env.OPENSTACK_SSHKEY_PUB;

const client = new OpenStackClient(OPENSTACK_URL);

const serverName = "hyphe-openstack-client-test";

let server = null;

async function read(filepath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, { encoding: "utf-8" }, (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
}

describe("Client - Paid - Server", () => {
  after(async () => {
    try {
      await client.deleteComputeServer(OPENSTACK_REGION, server.id);
      console.log("Server is deleted");
      const serverDetail = await client.getComputeServer(OPENSTACK_REGION, server.id);
      console.log("Server found", serverDetail);
    } catch (e) {}
  });
  it("Create a server should work", async () => {
    try {
      // STEP 1 : auth
      await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);

      // // Step 2 : Create a network or find a public one
      // console.log(await client.getNetworkNetworks(OPENSTACK_REGION));
      // // ~~~~~~~~~~~~~~~~~~~
      // const networkName = "hyphe-network";
      // let network = (await client.getNetworkNetworks(OPENSTACK_REGION))
      //   .filter(network => {
      //     return network.name === networkName;
      //   })
      //   .shift();
      // if (network) {
      //   console.log("Network found", network);
      // } else {
      //   // create the network
      //   network = await client.createNetworkNetwork(OPENSTACK_REGION, {
      //     shared: true,
      //     "provider:physical_network": "public",
      //     "provider:network_type": "flat",
      //     name: networkName
      //   });
      //   console.log("Network created", network);
      //
      //   const subnetName = "hyphe-subnet";
      //   const subnet = await client.createNetworkSubnet(
      //     OPENSTACK_REGION,
      //     network.id,
      //     {
      //       name: subnetName,
      //       ip_version: 4,
      //       cidr: "10.0.0.0/24",
      //       dns_nameservers: "8.8.7.7",
      //       gateway_ip: "10.0.0.254"
      //     }
      //   );
      //   console.log("Subnet created", subnet);
      // }

      // Step 3 : create a security group with valid rules
      // ~~~~~~~~~~~~~~~~~~~~~~~
      const securityGroupName = "hyphe-security-rules";
      let securityGroup = (await client.getNetworkSecurityGroups(OPENSTACK_REGION))
        .filter(group => {
          return group.name === securityGroupName;
        })
        .shift();
      if (securityGroup) {
        console.log("securityGroup found", securityGroup);
      } else {
        securityGroup = await client.createNetworkSecurityGroup(OPENSTACK_REGION, securityGroupName);
        console.log("Security group created", securityGroup);

        // Create Security rules
        await client.createNetworkSecurityGroupRule(OPENSTACK_REGION, securityGroup.id, {
          direction: "ingress",
          port_range_min: "80",
          ethertype: "IPv4",
          port_range_max: "81",
          protocol: "tcp",
          description: "http",
        });
        await client.createNetworkSecurityGroupRule(OPENSTACK_REGION, securityGroup.id, {
          direction: "ingress",
          port_range_min: "443",
          ethertype: "IPv4",
          port_range_max: "443",
          protocol: "tcp",
          description: "https",
        });
        await client.createNetworkSecurityGroupRule(OPENSTACK_REGION, securityGroup.id, {
          direction: "ingress",
          port_range_min: "22",
          ethertype: "IPv4",
          port_range_max: "22",
          protocol: "tcp",
          description: "ssh",
        });
      }

      // Step 4 : Search the image
      // ~~~~~~~~~~~~~~~~~~~~~~~~
      const image = (
        await client.getImages(OPENSTACK_REGION, {
          name: OPENSTACK_IMAGE,
        })
      ).shift();
      console.log("Image found", image);

      // Step 5 :Search the  flavor
      // ~~~~~~~~~~~~~~~~~~~~~~~~
      const flavor = (await client.getComputeFlavors(OPENSTACK_REGION))
        .filter(item => {
          return item.name === OPENSTACK_FLAVOR;
        })
        .shift();
      console.log("Flavor found", flavor);

      // Step 6 : Search SSH Key or create it
      // ~~~~~~~~~~~~~~~~~~~~~~~~
      let sshKey = (await client.getComputeKeypairs(OPENSTACK_REGION))
        .filter(item => {
          return item.name === OPENSTACK_SSHKEY_NAME;
        })
        .shift();
      if (sshKey) {
        console.log("SSH Key found", sshKey);
      } else {
        sshKey = await client.setComputeKeypair(OPENSTACK_REGION, OPENSTACK_SSHKEY_NAME, OPENSTACK_SSHKEY_PUB);
        console.log("SSH Key added", sshKey);
      }

      // Step 6 : Convert shell script to base64
      // ~~~~~~~~~~~~~~~~~~~~~~~~
      // TODO: make a call to the github repo to retrieve the script
      const content = await read("./test/shell/script.sh");
      console.log("Encoding script");
      const content64 = Buffer.from(content).toString("base64");
      console.log("Encoding script is", content64);

      // Step 7 : Create the server
      // ~~~~~~~~~~~~~~~~~~~~~~~~
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
            volume_size: 10,
          },
        ];
      }
      server = await client.createComputeServer(OPENSTACK_REGION, serverName, image.id, flavor.id, options);
      console.log("Server is created", server);

      // Wait until server is up and running
      // ~~~~~~~~~~~~~~~~~~~~~~~~
      let isRunning = false;
      let server2 = null;
      while (!isRunning) {
        // waiting 2 sec
        await new Promise(resolve => setTimeout(resolve, 2000));
        server2 = await client.getComputeServer(OPENSTACK_REGION, server.id);
        console.log(server2);
        if (server2.status === "ACTIVE") {
          console.log("Server is ready !");
          isRunning = true;
          const ips = await client.getComputeServerIp(OPENSTACK_REGION, server.id);
          console.log(JSON.stringify(ips));
        }
      }
      assert.isOk(isRunning);
    } catch (e) {
      console.log(e);
      assert.fail();
    }
  });
});
