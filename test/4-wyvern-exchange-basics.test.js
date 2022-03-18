const { ethers, waffle } = require("hardhat");
const { expect, use } = require("chai");
const { hashOrder, hashToSign, ZERO_ADDRESS, structToSign } = require('./util');
const { eip712Domain } = require("./eip712");

describe.only("Wyvern Exchange", () => {

  let owner, user1, user2, user3, user4;
  let Registry, registry;
  let Exchange, exchange;
  let example;

  const personalSignPrefixes = "\x19Ethereum Signed Message:\n";

  const timeForward = async (n) => {
    await ethers.provider.send('evm_increaseTime', [n]);
    blockForward(1);
  }

  const blockForward = async (n) => {
    for (let i = 0; i < n; i++) {
      await ethers.provider.send('evm_mine', []);
    }
  }

  const eip712Order = {
    name: 'Order',
    fields: [
      { name: 'registry', type: 'address' },
      { name: 'maker', type: 'address' },
      { name: 'staticTarget', type: 'address' },
      { name: 'staticSelector', type: 'bytes4' },
      { name: 'staticExtradata', type: 'bytes' },
      { name: 'maximumFill', type: 'uint256' },
      { name: 'listingTime', type: 'uint256' },
      { name: 'expirationTime', type: 'uint256' },
      { name: 'salt', type: 'uint256' }
    ]
  }
  
  beforeEach(async () => {

    [owner, user1, user2, user3, user4] = await ethers.getSigners();

    Registry = await ethers.getContractFactory("WyvernRegistry");
    registry = await Registry.deploy();
    await registry.deployed();

    Exchange = await ethers.getContractFactory("WyvernExchange");
    exchange = await Exchange.deploy(50, [registry.address, '0xa5409ec958C83C3f309868babACA7c86DCB077c1'], Buffer.from(personalSignPrefixes, 'binary'));
    await exchange.deployed();

    await registry.grantInitialAuthentication(exchange.address);
    example = {
      registry: registry.address, maker: user1.address, staticTarget: ZERO_ADDRESS, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '0', salt: '0'
    };
  })

  it("Is deployed", async () => {
  })

  it("Correctly hashes order", async () => {
    const hash = await exchange.hashOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt
    );
    expect(hashOrder(example)).to.eq(hash);
  })

  it("Correctly hashes order to sign", async () => {
    const orderHash = await exchange.hashOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt
    );
    const hash = await exchange.hashToSign_(orderHash);
    expect(hashToSign(example, exchange.address)).to.eq(hash);
  })

  it("does not allow set-fill to same fill", async () => {
    example.maker = user2.address;
    const hash = await exchange.hashOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt 
    );
    expect(exchange.setOrderFill_(hash, 0)).to.be.revertedWith("Fill is already set to the desired value");
  })

  it("validates valid order parameters", async () => {
    example = {registry: registry.address,maker: owner.address, staticTarget: exchange.address,staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1000000000000',salt: '0'}
    expect(await exchange.validateOrderParameters_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt 
    )).to.be.true;
  })

  it("does not validate order parameters with invalid staticTarget", async () => {
    example = { ...example, maker: owner.address, staticTarget: ZERO_ADDRESS, expirationTime: "1000000000000"}
    expect(await exchange.validateOrderParameters_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt 
    )).to.be.false;
  })

  it("does not validate order parameters with listingTime after now", async () => {
    example = {registry: registry.address,maker: owner.address,staticTarget: exchange.address,staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '1000000000000', expirationTime: '1000000000000', salt: '0'}  
    expect(await exchange.validateOrderParameters_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt 
    )).to.be.false;
  })

  it("does not validate order parameters with expirationTime before now", async () => {
    example = {registry: registry.address, maker: owner.address,staticTarget: exchange.address,staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1',salt: '0'};
    expect(await exchange.validateOrderParameters_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt 
    )).to.be.false;
  })

  it("validates valid authorization by signature (sign_typed_data)", async () => {
    example = {registry: registry.address, maker: owner.address, staticTarget: exchange.address,staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1000000000000',salt: '100230'}
    const str = structToSign(example, exchange.address);
    const signature = await user1._signTypedData( str.domain, {Order: str.fields}, str.data);
    const sig = ethers.utils.splitSignature(signature);
    const hash = hashOrder(example);
    expect(await exchange.validateOrderAuthorization_(hash, user1.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [sig.v, sig.r, sig.s]))).to.be.true;
  })




})