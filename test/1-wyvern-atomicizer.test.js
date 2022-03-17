const { ethers } = require("hardhat");

describe("WyvernAtomicizer", () => {
  it('Is successfully deployed', async () => {
    const Atomicizer = await ethers.getContractFactory("WyvernAtomicizer");
    const atomicizer = await Atomicizer.deploy();
    await atomicizer.deployed();
  })
})