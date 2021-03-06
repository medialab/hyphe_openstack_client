import chai from "chai";
import OpenStackClient from "../lib/node-openstack-client";

chai.expect();
const assert = chai.assert;

const OPENSTACK_URL = process.env.OPENSTACK_URL;
const OPENSTACK_USER = process.env.OPENSTACK_USER;
const OPENSTACK_PASSWORD = process.env.OPENSTACK_PASSWORD;
const OPENSTACK_DOMAIN = process.env.OPENSTACK_DOMAIN;
const OPENSTACK_PROJECT = process.env.OPENSTACK_PROJECT;

const OPENSTACK_REGION = process.env.OPENSTACK_REGION;

const client = new OpenStackClient(OPENSTACK_URL);

describe("Client - Auth", () => {
  it("Auth with valid login / password should work", async () => {
    try {
      await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
    } catch (e) {
      assert.fail("Should not throw an exception");
    }
  });
  it("Auth with invalid login / password should throw an exception", async () => {
    try {
      await client.authenticate("bli", "bla", OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
      assert.fail("Should throw an exception");
    } catch (e) {
      assert.include(e.message, "Fail to authenticate user bli");
    }
  });
});

describe("Client - Regions", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
  });

  it("get region list with a valid service should work", async () => {
    const result = await client.getRegions("compute");
    assert.isTrue(result.length > 0);
  });

  it("get region list with an unknown service should throw an exception", async () => {
    try {
      const result = await client.getRegions("bla");
    } catch (e) {
      assert.include(e.message, "The service 'bla' doesn't exist");
    }
  });
});

describe("Client - Images", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
  });

  it("get images with a valid region should work", async () => {
    const result = await client.getImages(OPENSTACK_REGION);
    assert.isTrue(result.length > 0);
  });
});

describe("Client - Compute - Flavor", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
  });

  it("get compute flavors with a valid region should work", async () => {
    const result = await client.getComputeFlavors(OPENSTACK_REGION);
    assert.isTrue(result.length >= 0);
  });
});

describe("Client - Compute - Keypair", () => {
  const sshKeyName = "hyphe-openstack-client-test";
  const sshKeyPublic =
    "ssh-rsa AAAAB3NzaC1yc2EAAAADAQABAAAAgQDx8nkQv/zgGgB4rMYmIf+6A4l6Rr+o/6lHBQdW5aYd44bd8JttDCE/F/pNRr0lRE+PiqSPO8nDPHw0010JeMH9gYgnnFlyY3/OcJ02RhIPyyxYpv9FhY+2YiUkpwFOcLImyrxEsYXpD/0d3ac30bNH6Sw9JD9UZHYcpSxsIbECHw== Generated-by-Nova";

  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
    try {
      await client.deleteComputeKeypair(OPENSTACK_REGION, sshKeyName);
    } catch (e) {}
  });

  it("get compute keypair list with a valid region should work", async () => {
    const result = await client.getComputeKeypairs(OPENSTACK_REGION);
    assert.isTrue(result.length >= 0);
  });

  it("Set compute keypair should work", async () => {
    try {
      const result = await client.setComputeKeypair(OPENSTACK_REGION, sshKeyName, sshKeyPublic);
      assert.equal(result.name, sshKeyName);
      assert.equal(result.public_key, sshKeyPublic);
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });

  it("Delete compute keypair should work", async () => {
    try {
      await client.deleteComputeKeypair(OPENSTACK_REGION, sshKeyName);
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });
});

describe("Client - Compute - Server", () => {
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
  });

  it("get compute server list with a valid region should work", async () => {
    const result = await client.getComputeServers(OPENSTACK_REGION);
    assert.isTrue(result.length >= 0);
  });
});

describe("Client - Network - Network", () => {
  let network;
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
  });

  it("get networks list with a valid region should work", async () => {
    const result = await client.getNetworkNetworks(OPENSTACK_REGION);
    assert.isTrue(result.length >= 0);
  });

  it("create valid network should work", async () => {
    network = await client.createNetworkNetwork(OPENSTACK_REGION, { name: "TEST" });
    assert.isOk(network);
  });

  it("get network should work", async () => {
    const result = await client.getNetworkNetwork(OPENSTACK_REGION, network.id);
    assert.isOk(result);
  });

  it("delete network should work", async () => {
    try {
      await client.deleteNetworkNetwork(OPENSTACK_REGION, network.id);
    } catch (e) {
      console.log(e);
      assert.fail(`Should not throw an exception ${e}`);
    }
  });
});

describe("Client - Network - Subnets", () => {
  let network;
  let subnet;
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
    network = await client.createNetworkNetwork(OPENSTACK_REGION, { name: "TEST_NETWORK" });
  });
  after(async () => {
    try {
      await client.deleteNetworkNetwork(OPENSTACK_REGION, network.id);
    } catch (e) {}
  });

  it("get Subnets list should work", async () => {
    try {
      const result = await client.getNetworkSubnets(OPENSTACK_REGION);
      assert.isTrue(result.length >= 0);
    } catch (e) {
      console.log(e);
      assert.fail(`Should not throw an exception ${e}`);
    }
  });

  it("create valid Subnet should work", async () => {
    subnet = await client.createNetworkSubnet(OPENSTACK_REGION, network.id, 4, "10.0.0.0/24", {
      name: "TEST_SUBNET",
    });
    assert.isOk(subnet);
  });

  it("get Subnet should work", async () => {
    const result = await client.getNetworkSubnet(OPENSTACK_REGION, subnet.id);
    assert.isOk(result);
  });

  it("delete Subnet should work", async () => {
    try {
      await client.deleteNetworkSubnet(OPENSTACK_REGION, subnet.id);
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });
});

describe("Client - Network - security group", () => {
  let securityGroup;
  before(async () => {
    await client.authenticate(OPENSTACK_USER, OPENSTACK_PASSWORD, OPENSTACK_DOMAIN, OPENSTACK_PROJECT);
  });

  it("get security group list should work", async () => {
    const result = await client.getNetworkSecurityGroups(OPENSTACK_REGION);
    assert.isTrue(result.length >= 0);
  });

  it("create valid security group should work", async () => {
    securityGroup = await client.createNetworkSecurityGroup(OPENSTACK_REGION, "TEST_SECU_G");
    assert.isOk(securityGroup);
  });

  it("get security group should work", async () => {
    const result = await client.getNetworkSecurityGroup(OPENSTACK_REGION, securityGroup.id);
    assert.isOk(result);
  });

  it("delete security group should work", async () => {
    try {
      await client.deleteNetworkSecurityGroup(OPENSTACK_REGION, securityGroup.id);
    } catch (e) {
      assert.fail(`Should not throw an exception ${e}`);
    }
  });
});
