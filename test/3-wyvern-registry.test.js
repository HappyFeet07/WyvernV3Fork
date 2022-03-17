const { ethers, waffle } = require("hardhat");
const { expect, use } = require("chai");

describe.only("WyvernRegistry", () => {

  let owner, user1, user2;
  let Registry, registry;
  let Exchange, exchange;
  let ERC20, erc20;

  const timeForward = async (n) => {
    await ethers.provider.send('evm_increaseTime', [n]);
  }

  beforeEach(async () => {

    [owner, user1, user2] = await ethers.getSigners();

    Registry = await ethers.getContractFactory("WyvernRegistry");
    registry = await Registry.deploy();
    Exchange = await ethers.getContractFactory("WyvernExchange");
    exchange = await Exchange.deploy(1, [registry.address], Buffer.from( "\x19Ethereum Signed Message:\n", 'binary'));
    ERC20 = await ethers.getContractFactory("TestERC20");
    erc20 = await ERC20.connect(owner).deploy();

    await registry.deployed();
    await registry.grantInitialAuthentication(exchange.address);
    await registry.connect(user1).registerProxy();
    await erc20.deployed();
  })

  it("Is successfully deployed", async () => {
    return true;
  })

  it("does not allow additional grant", async () => {
    await expect(registry.grantInitialAuthentication(registry.address)).to.revertedWith("Wyvern Protocol Proxy Registry initial address already set");
  })

  it("has a delegateproxyimpl", async () => {
    const delegateproxyimpl = await registry.delegateProxyImplementation();
    expect(delegateproxyimpl.length).to.eq(42);
  })

  it("allows proxy registration", async () => {
    const proxy = await registry.proxies(user1.address);
    expect(proxy.length).to.greaterThan(0);
  })

  it("allows proxy override", async () => {
    await registry.connect(user1).registerProxyOverride();
    const proxy = await registry.proxies(user1.address);
    expect(proxy.length).to.greaterThan(0);
  })

  it("allow proxy upgrade", async () => {
    const proxy = await registry.proxies(user1.address);
    const OwnableDelegateProxy = await ethers.getContractAt("OwnableDelegateProxy", proxy);
    const impl = await registry.delegateProxyImplementation();
    expect(await OwnableDelegateProxy.connect(user1).upgradeTo(registry.address));
    expect(await OwnableDelegateProxy.connect(user1).upgradeTo(impl));
  })

  it("allow proxy to receive ether", async () => {
    const proxy = await registry.proxies(user1.address);
    user1.sendTransaction({ to: proxy, value: 1000});
  })

  it("allow proxy to receive tokens before approval", async () => {
    const amount = "1000";
    const proxy = await registry.proxies(user1.address);
    const AuthenticatedProxy = await ethers.getContractAt("TestAuthenticatedProxy", proxy);
    expect(AuthenticatedProxy.connect(user1).receiveApproval(user1.address, amount, erc20.address, "0x")).to.revertedWith("ERC20: transfer amount exceeds balance");
  })

  it("allow proxy to receive tokens", async () => {
    const amount = '1000';
    const proxy = await registry.proxies(user1.address);
    await erc20.mint(user1.address, amount);
    await erc20.connect(user1).approve(proxy, amount);
    const AuthenticatedProxy = await ethers.getContractAt("TestAuthenticatedProxy", proxy);
    await AuthenticatedProxy.connect(user1).receiveApproval(user1.address, amount, erc20.address, "0x");
  })

  it("does not allow proxy upgrade to same implementation", async () => {
    const proxy = await registry.proxies(user1.address);
    const impl = await registry.delegateProxyImplementation();
    const OwnableDelegateProxy = await ethers.getContractAt("OwnableDelegateProxy", proxy);
    expect(OwnableDelegateProxy.connect(user1).upgradeTo(impl)).to.be.revertedWith('Proxy already uses this implementation');
  })

  it("returns proxy type", async () => {
    const proxy = await registry.proxies(user1.address);
    const OwnableDelegateProxy = await ethers.getContractAt("OwnableDelegateProxy", proxy);
    expect(await OwnableDelegateProxy.proxyType()).to.eq(2);
  })

  it("does not allow proxy update from another account", async () => {
    const proxy = await registry.proxies(user1.address);
    const OwnableDelegateProxy = await ethers.getContractAt("OwnableDelegateProxy", proxy);
    expect(OwnableDelegateProxy.connect(user2).upgradeTo(registry.address)).to.be.revertedWith("Returned error: VM Exception while processing transaction: revert");
  })

  it("allows proxy ownership transfer", async () => {
    const proxy = await registry.proxies(user1.address);
    const OwnableDelegateProxy = await ethers.getContractAt("OwnableDelegateProxy", proxy);
    await OwnableDelegateProxy.connect(user1).transferProxyOwnership(user2.address);
    await OwnableDelegateProxy.connect(user2).transferProxyOwnership(user1.address);
  })

  it("allows start but not end of authentication process", async () => {
    await registry.startGrantAuthentication(user1.address);
    const timestamp = await registry.pending(user1.address);
    expect(timestamp.toNumber()).to.gt(0);
    expect(registry.endGrantAuthentication(user1.address)).to.be.revertedWith("Contract is no longer pending or has already been approved by registr");
  })

  it("does not allow start twice", async () => {
    expect(registry.startGrantAuthentication(user2.address)).to.be.revertedWith("Contract is already allowed in registry, or pending");
  })

  it("does not allow end without start", async () => {
    expect(registry.endGrantAuthentication(user1.address)).to.be.revertedWith("Contract is no longer pending or has already been approved by registr");
  })

  /*it("allows end after time has passed", async () => {
    await registry.startGrantAuthentication(user1.address);
    let time
  })*/


})