import chai from "chai";
import * as fs from "fs";
import { OpenStackClient } from "../src/index";

chai.expect();
const assert = chai.assert;

const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;

const minOvhFlavor = "s1-2";
const serverImage = "Debian 10";
const sshKeyName = "bsimard";
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
      const client = new OpenStackClient("https://auth.cloud.ovh.net/v3");

      // Auth
      await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);

      // Search a debian image
      const image = (await client.getImages("UK1", {
        name: serverImage
      })).shift();
      console.log("Image found", image);

      // Search the min flavor
      const flavor = (await client.getComputeFlavors("UK1"))
        .filter(item => {
          return item.name === minOvhFlavor;
        })
        .shift();
      console.log("Flavor found", flavor);

      // Search SSH Key
      //await client.setComputeKeypair("UK1", sshKeyName, sshKeyPub);
      const sshKey = (await client.getComputeKeypairs("UK1", { limit: 10 }))
        .filter(item => {
          return item.name === sshKeyName;
        })
        .shift();
      console.log("SSH Key found", sshKey);

      // Convert shell script to base64
      // TODO: make a call to the github repo to retrieve the script
      const content = await read("./test/post-install.sh");
      console.log("Encoding script");
      const content64 = Buffer.from(content).toString("base64");
      console.log("Encoding script is", content64);

      // Create the server
      let server = await client.createComputeServer(
        "UK1",
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
        server = await client.getComputeServer("UK1", server.id);
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
