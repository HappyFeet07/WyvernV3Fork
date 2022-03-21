const { ethers, waffle } = require("hardhat");
const { expect, use } = require("chai");
const { hashOrder, hashToSign, ZERO_ADDRESS, structToSign, ZERO_BYTES32 } = require('./util');
const { eip712Domain } = require("./eip712");

describe("Wyvern Exchange", () => {

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
    example = {registry: registry.address, maker: owner.address, staticTarget: exchange.address,staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1000000000000',salt: '100230'};
    const str = structToSign(example, exchange.address);
    const signature = await user1._signTypedData( str.domain, {Order: str.fields}, str.data);
    const sig = ethers.utils.splitSignature(signature);
    const hash = hashOrder(example);
    expect(await exchange.validateOrderAuthorization_(hash, user1.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [sig.v, sig.r, sig.s]))).to.be.true;
  })

  it("validates valid authorization by signature (personal_sign)", async () => {
    example = {registry: registry.address,maker: owner.address, staticTarget: exchange.address, staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1000000000000',salt: '100231'};
    const hash = hashOrder(example);
    const hts = hashToSign(example, exchange.address);
    let sig = await owner.signMessage(hts);
    sig = ethers.utils.splitSignature(sig);
    sig = { ...sig, v: sig.v + 27, suffix: '03'};
    expect(await exchange.validateOrderAuthorization_(hash, owner.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [sig.v, sig.r, sig.s]) + sig.suffix )).to.be.true;
  })

  /*it("does not validate authorization by signature with different prefix (personal_sign)", async () => {
    const prefix = Buffer.from("\x19Bogus Signed Message:\n",'binary');
    const newRegistry = await Registry.deploy();
    const newExchange = await Exchange.deploy(50, [registry.address], prefix);
    await newRegistry.grantInitialAuthentication(newExchange.address);
    example = {registry: newRegistry.address,maker: owner.address,staticTarget: newExchange.address,staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1000000000000',salt: '100231'};
    const hash = hashOrder(example);
    const hts = hashToSign(example, newExchange.address);
    let sig = await owner.signMessage(hts);
    sig = ethers.utils.splitSignature(sig);
    sig = { ...sig, v: sig.v + 27, suffix: '03'};
    expect(await newExchange.validateOrderAuthorization_(hash, owner.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [sig.v, sig.r, sig.s]) + sig.suffix )).to.be.false;
  })*/

  it("does not allow approval twice", async () => {
    example = {registry: registry.address,maker: owner.address,staticTarget: exchange.address,staticSelector: '0x00000000',staticExtradata: '0x',maximumFill: '1',listingTime: '0',expirationTime: '1000000000000',salt: '1010'};
    await exchange.approveOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt, false
    )
    await expect(exchange.approveOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt, false
    )).to.be.revertedWith("Order has already been approved");
  })

  it("does not allow approval from another user", async () => {
    example = {registry: registry.address, maker: owner.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '10101234'}
    await expect(exchange.connect(user1).approveOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt, false
    )).to.be.revertedWith("Sender is not the maker of the order and thus not authorized to approve it");
  })

  it("validates valid authorization by approval", async () => {
    example = {registry: registry.address, maker: owner.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '10'};
    await exchange.connect(owner).approveOrder_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt, false
    );
    const hash = hashOrder(example);
    expect(await exchange.connect(user2).validateOrderAuthorization_(
      hash, user2.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [27, ZERO_BYTES32, ZERO_BYTES32])
    )).to.be.true;
  })

  it("validates valid authorization by hash-approval", async () => {
    example = {registry: registry.address, maker: user1.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '1'};
    const hash = hashOrder(example);
    await exchange.connect(user1).approveOrderHash_(hash);
    expect(await exchange.connect(user2).validateOrderAuthorization_(
      hash, user2.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [27, ZERO_BYTES32, ZERO_BYTES32])
    )).to.be.true;
  })

  it("validates valid authorization by maker", async () => {
    example = {registry: registry.address, maker: owner.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '5'};
    const hash = hashOrder(example);
    expect(await exchange.connect(owner).validateOrderAuthorization_(hash, owner.address,  await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [27, ZERO_BYTES32, ZERO_BYTES32]))).to.be.true;
  })

  it("validates valid authorization by cache", async () => {
    example = {registry: registry.address, maker: user1.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '6'};
    const hash = hashOrder(example);
    await exchange.connect(user1).setOrderFill_(hash, 2);
    expect(await exchange.connect(owner).validateOrderAuthorization_(
      hash, owner.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [27, ZERO_BYTES32, ZERO_BYTES32])
    )).to.be.true;
  })

  it("does not validate authorization without signature", async () => {
    example = {registry: registry.address, maker: user1.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '0'};
    const hash = hashOrder(example);
    expect(await exchange.validateOrderAuthorization_(
      hash, user1.address, await ethers.utils.defaultAbiCoder.encode(['uint8', 'bytes32', 'bytes32'], [27, ZERO_BYTES32, ZERO_BYTES32])
    )).to.be.false;
  })

  it("does not validate cancelled order", async () => {
    example = {registry: registry.address, maker: user1.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '20'}; 
    await exchange.connect(user1).setOrderFill_(hashOrder(example), 1);
    expect(await exchange.validateOrderParameters_(
      example.registry, example.maker, example.staticTarget, example.staticSelector, example.staticExtradata, example.maximumFill, example.listingTime, example.expirationTime, example.salt 
    )).to.be.false;
  })

  it("allows order cancellation by maker", async () => {
    example = {registry: registry.address, maker: user1.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '3'};
    await exchange.connect(user1).setOrderFill_(hashOrder(example), 1);
  })

  it("allows order cancellation by non-maker", async () => {
    example = {registry: registry.address, maker: user1.address, staticTarget: exchange.address, staticSelector: '0x00000000', staticExtradata: '0x', maximumFill: '1', listingTime: '0', expirationTime: '1000000000000', salt: '4'};
    await exchange.connect(user3).setOrderFill_(hashOrder(example), 1);
  })
})