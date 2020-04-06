import chai from "chai";
import { OpenStackClient } from "../src/index";

chai.expect();

const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;

const assert = chai.assert;

const client = new OpenStackClient("https://auth.cloud.ovh.net/v3");

describe("Client - Auth", () => {
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

describe("Client - Regions", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
  });

  it("get region list with a valid service should work", async () => {
    const result = await client.getRegions("compute");
    assert.isTrue(result.length > 0);
  });

  it("get region list with an unknown service should throw an exception", async () => {
    try {
      const result = await client.getRegions("bla");
    } catch (e) {
      assert.equal(e.message, "The service 'bla' doesn't exist");
    }
  });
});

describe("Client - Images", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
  });

  it("get images with a valid region should work", async () => {
    const result = await client.getImages("UK1");
    assert.isTrue(result.length > 0);
  });

  it("get images with an unknown region should throw an exception", async () => {
    try {
      const result = await client.getImages("BLA");
    } catch (e) {
      assert.equal(e.message, "Failed to retrieve the image list");
    }
  });
});

describe("Client - Compute - Flavor", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
  });

  it("get compute flavors with a valid region should work", async () => {
    const result = await client.getComputeFlavors("UK1");
    assert.isTrue(result.length > 0);
  });

  it("get compute flavors with an unknown region should throw an exception", async () => {
    try {
      const result = await client.getComputeFlavors("BLA");
    } catch (e) {
      assert.equal(e.message, "Failed to retrieve the compute flavor list");
    }
  });
});

describe("Client - Compute - Keypair", () => {
  const sshKeyName = "hyphe-openstack-client-test";
  const sshKeyPublic =
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDx8nkQv/zgGgB4rMYmIf+6A4l6Rr+o/6lHBQdW5aYd44bd8JttDCE/F/pNRr0lRE+PiqSPO8nDPHw0010JeMH9gYgnnFlyY3/OcJ02RhIPyyxYpv9FhY+2YiUkpwFOcLImyrxEsYXpD/0d3ac30bNH6Sw9JD9UZHYcpSxsIbECHw== Generated-by-Nova";

  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
    try {
      await client.deleteComputeKeypair("UK1", sshKeyName);
    } catch (e) {}
  });

  it("get compute keypair list with a valid region should work", async () => {
    const result = await client.getComputeKeypairs("UK1");
    assert.isTrue(result.length > 0);
  });

  it("get compute keypair list with an unknown region should throw an exception", async () => {
    try {
      const result = await client.getComputeKeypairs("BLA");
    } catch (e) {
      assert.equal(e.message, "Failed to retrieve the compute keypair list");
    }
  });

  it("Set compute keypair should work", async () => {
    try {
      const result = await client.setComputeKeypair(
        "UK1",
        sshKeyName,
        sshKeyPublic
      );
      assert.equal(result.name, sshKeyName);
      assert.equal(result.public_key, sshKeyPublic);
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });

  it("Delete compute keypair should work", async () => {
    try {
      await client.deleteComputeKeypair("UK1", sshKeyName);
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });
});

describe("Client - Compute - Server", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD);
  });

  it("get compute server list with a valid region should work", async () => {
    try {
      const result = await client.getComputeServers("UK1");
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });
});
