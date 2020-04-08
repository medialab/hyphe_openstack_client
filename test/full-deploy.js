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

const serverName = "hyphe-openstack-client-fulltest";

/**
 * Read the content of the file located at `filepath`.
 * @param {string} filepath : location of the file to read
 * @return {Promise<string>} The content of the file as a string
 */
function read(filepath) {
  return new Promise((resolve, reject) => {
    fs.readFile(filepath, { encoding: "utf-8" }, (err, data) => {
      if (err) reject(err);
      resolve(data);
    });
  });
}

describe("Hyphe deploy", () => {
  it("Full deployment should work", async () => {
    try {
      const client = new OpenStackClient(OPENSTACK_URL);

      // Auth
      await client.authenticate(
        OPENSTACK_USER,
        OPENSTACK_PASSWORD,
        OPENSTACK_DOMAIN,
        OPENSTACK_PROJECT
      );

      // Search a debian image
      const image = (await client.getImages(OPENSTACK_REGION, {
        name: OPENSTACK_IMAGE
      })).shift();
      console.log("Image found", image);

      // Search the min flavor
      const flavor = (await client.getComputeFlavors(OPENSTACK_REGION))
        .filter(item => {
          return item.name === OPENSTACK_FLAVOR;
        })
        .shift();
      console.log("Flavor found", flavor);

      // Search SSH Key
      //await client.setComputeKeypair(OPENSTACK_REGION, sshKeyName, sshKeyPub);
      let sshKey = (await client.getComputeKeypairs(OPENSTACK_REGION))
        .filter(item => {
          return item.name === OPENSTACK_SSHKEY_NAME;
        })
        .shift();
      if (sshKey) {
        console.log("SSH Key found", sshKey);
      } else {
        sshKey = await client.setComputeKeypair(
          OPENSTACK_REGION,
          OPENSTACK_SSHKEY_NAME,
          OPENSTACK_SSHKEY_PUB
        );
        console.log("SSH Key added", sshKey);
      }

      // Convert shell script to base64
      // TODO: make a call to the github repo to retrieve the script
      const content = await read("./test/post-install.sh");
      console.log("Encoding script");
      const content64 = Buffer.from(content).toString("base64");
      console.log("Encoding script is", content64);

      // Create the server
      let server = await client.createComputeServer(
        OPENSTACK_REGION,
        serverName,
        image.id,
        flavor.id,
        { key_name: sshKey.name, user_data: content64 }
      );
      console.log("Server is created", server);

      // Wait until server is up and running
      let isRunning = false;
      while (!isRunning) {
        // waiting 2 sec
        await new Promise(resolve => setTimeout(resolve, 2000));
        server = await client.getComputeServer(OPENSTACK_REGION, server.id);
        console.log(`${server.progress} %`);
        if (server.status === "ACTIVE") {
          console.log("Server is ready !", server);
          isRunning = true;
          console.log(JSON.stringify(server.addresses));
        }
      }
      assert.isOk(isRunning);
    } catch (e) {
      console.log(e);
      assert.fail();
    }
  });
});
