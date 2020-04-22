import chai from "chai";
import * as fs from "fs";
import OpenStackClient from "../lib/node-openstack-client";

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
  it("Create a hyphe server should work", async () => {
    try {
      await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);

      const server = await client.hypheDeploy(OPENSTACK_REGION, {
        image: OPENSTACK_IMAGE,
        flavor: OPENSTACK_FLAVOR,
        ssh: { name: OPENSTACK_SSHKEY_NAME, key: OPENSTACK_SSHKEY_PUB },
        disk: 10,
        servername: serverName,
        hyphe_config: {
          bli: "bla",
          foo: "bar",
        },
      });

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
