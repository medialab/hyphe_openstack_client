import chai from "chai";
import { OpenStackClient } from "../src/index";

chai.expect();

const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;

const assert = chai.assert;

const client = new OpenStackClient("https://auth.cloud.ovh.net/v3");

describe("Client - Paid", () => {
  it("Auth with valid login / password should work", async () => {
    try {
      await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
    } catch (e) {
      assert.fail("Should not throw an exception");
    }
  });
  it("Auth with invalid login / password should throw an exception", async () => {
    try {
      await client.authenticate("bli", "bla");
      assert.fail("Should throw an exception");
    } catch (e) {
      assert.equal(e.message, "Failed to authenticate the user");
    }
  });
});
