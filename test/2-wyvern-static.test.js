const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("WyvernStatic", () => {

  let WyvernStatic, wyvernstatic;
  let WyvernAtomicizer, wyvernatomicizer;

  beforeEach(async () => {
    WyvernAtomicizer = await ethers.getContractFactory("WyvernAtomicizer");
    wyvernatomicizer = await WyvernAtomicizer.deploy();
    WyvernStatic = await ethers.getContractFactory("WyvernStatic");
    wyvernstatic = await WyvernStatic.deploy(wyvernatomicizer.address);
    await wyvernstatic.deployed();
  })

  it("Is successfully deployed", async () => {
    return true;
  })

  it("has the correct atomicizer address", async () => {
    await wyvernatomicizer.deployed();
    expect(await wyvernstatic.atomicizer()).to.eq(wyvernatomicizer.address);
  })
})