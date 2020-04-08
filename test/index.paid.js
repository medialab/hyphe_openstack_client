import chai from "chai";
import { OpenStackClient } from "../src/index";

const OPENSTACK_URL = process.env.OPENSTACK_URL;
const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;
const OPENSTACK_DOMAIN = process.env.OPENSTACK_DOMAIN;
const OPENSTACK_PROJECT = process.env.OPENSTACK_PROJECT;
const OPENSTACK_REGION = process.env.OPENSTACK_REGION;
const OPENSTACK_IMAGE = process.env.OPENSTACK_IMAGE;
const OPENSTACK_FLAVOR = process.env.OPENSTACK_FLAVOR;

const client = new OpenStackClient(OPENSTACK_URL);

const minOvhFlavor = "s1-2";
const serverImage = "Debian 10";
const serverName = "hyphe-openstack-client-test";

let server = null;

describe("Client - Paid - Server", () => {
  before(async () => {
    await client.authenticate(
      OPENSTACK_USER,
      OPENSTACK_PASSWORD,
      OPENSTACK_DOMAIN,
      OPENSTACK_PROJECT
    );
  });
  it("Create a server should work", async () => {
    try {
      // Search a debian image
      const image = (await client.getImages(OPENSTACK_REGION, {
        name: OPENSTACK_IMAGE
      })).shift();
      console.log("Image found", image);
      assert.equal(image.name, OPENSTACK_IMAGE);

      // Search the min flavor
      const flavor = (await client.getComputeFlavors(OPENSTACK_REGION))
        .filter(item => {
          return item.name === OPENSTACK_FLAVOR;
        })
        .shift();
      console.log("Flavor found", flavor);
      assert.equal(flavor.name, OPENSTACK_FLAVOR);

      // Create the server
      server = await client.createComputeServer(
        OPENSTACK_REGION,
        serverName,
        image.id,
        flavor.id
      );
      console.log("Server created", server);
      assert.exists(server.id);
      assert.exists(server.adminPass);

      // Retrieve the server status
      const serverDetail = await client.getComputeServer(
        OPENSTACK_REGION,
        server.id
      );
      console.log("Server found", serverDetail);
      assert.equal(serverDetail.name, serverName);
      assert.equal(serverDetail.image.id, image.id);
      assert.equal(serverDetail.flavor.id, flavor.id);
      assert.exists(serverDetail.progress);

      // Delete the server
      await client.deleteComputeServer(OPENSTACK_REGION, server.id);
    } catch (e) {
      assert.fail(e);
    }
  });

  after(async () => {
    try {
      await client.deleteComputeServer(OPENSTACK_REGION, server.id);
      console.log("Server is deleted");
      const serverDetail = await client.getComputeServer(
        OPENSTACK_REGION,
        server.id
      );
      console.log("Server found", serverDetail);
    } catch (e) {}
  });
});
