import chai from "chai";
import { OpenStackClient } from "../src/index";

chai.expect();

const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;

const assert = chai.assert;
const client = new OpenStackClient("https://auth.cloud.ovh.net/v3");

const minOvhFlavor = "s1-2";
const serverImage = "Debian 10";
const serverName = "hyphe-openstack-client-test";

let server = null;

describe("Client - Paid - Server", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
  });
  it("Create a server should work", async () => {
    try {
      // Search a debian image
      const image = (await client.getImages("UK1", {
        name: serverImage
      })).shift();
      console.log("Image found", image);
      assert.equal(image.name, serverImage);

      // Search the min flavor
      const flavor = (await client.getComputeFlavors("UK1"))
        .filter(item => {
          return item.name === minOvhFlavor;
        })
        .shift();
      console.log("Flavor found", flavor);
      assert.equal(flavor.name, minOvhFlavor);

      // Create the server
      server = await client.createComputeServer(
        "UK1",
        serverName,
        image.id,
        flavor.id
      );
      console.log("Server created", server);
      assert.exists(server.id);
      assert.exists(server.adminPass);

      // Retrieve the server status
      const serverDetail = await client.getComputeServer("UK1", server.id);
      console.log("Server found", serverDetail);
      assert.equal(serverDetail.name, serverName);
      assert.equal(serverDetail.image.id, image.id);
      assert.equal(serverDetail.flavor.id, flavor.id);
      assert.exists(serverDetail.progress);

      // Delete the server
      await client.deleteComputeServer("UK1", server.id);
    } catch (e) {
      assert.fail(e);
    }
  });

  after(async () => {
    try {
      await client.deleteComputeServer("UK1", server.id);
      console.log("Server is deleted");
      const serverDetail = await client.getComputeServer("UK1", server.id);
      console.log("Server found", serverDetail);
    } catch (e) {}
  });
});
