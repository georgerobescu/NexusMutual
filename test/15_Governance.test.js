const Governance = artifacts.require('Governance');
const NXMaster = artifacts.require('NXMaster');
const EventCaller = artifacts.require('EventCaller');
const ClaimsReward = artifacts.require('ClaimsReward');
const NXMToken = artifacts.require('NXMToken');
const expectEvent = require('./utils/expectEvent');
const assertRevert = require('./utils/assertRevert.js').assertRevert;
const encode = require('./utils/encoder.js').encode;
const AdvisoryBoard = '0x41420000';
const TokenFunctions = artifacts.require('TokenFunctions');

let tf;
let gv;
let cr;
let nxms;
let proposalId;
let pId;
let nxmToken;

contract('Governance', ([owner, notOwner, voter, noStake]) => {
  before(async function() {
    nxms = await NXMaster.deployed();
    tf = await TokenFunctions.deployed();
    cr = await ClaimsReward.deployed();
    nxmToken = await NXMToken.deployed();
    let address = await nxms.getLatestAddress('GV');
    gv = await Governance.at(address);
  });

  it('should not allow unauthorized to change master address', async function() {
    await assertRevert(
      gv.changeMasterAddress(nxms.address, { from: notOwner })
    );
    await gv.changeDependentContractAddress();
    await gv.changeMasterAddress(nxms.address);
  });

  it('Should create a proposal', async function() {
    let propLength = await gv.getProposalLength();
    proposalId = propLength.toNumber();
    await gv.createProposal('Proposal1', 'Proposal1', 'Proposal1', 0);
    await assertRevert(gv.createProposal('Add new member', 'Add new member', 'hash', 9, {from: notOwner}));
    let propLength2 = await gv.getProposalLength();
    assert.isAbove(
      propLength2.toNumber(),
      propLength.toNumber(),
      'Proposal not created'
    );
  });

  it('Should not allow unauthorized person to categorize proposal', async function() {
    await assertRevert(gv.categorizeProposal(proposalId, 1, 0, {from: notOwner}));
  });

  it('Should not categorize under invalid category', async function() {
    await assertRevert(gv.categorizeProposal(proposalId, 0, 0));
    await assertRevert(gv.categorizeProposal(proposalId, 25, 0));
  });

  it('Should categorize proposal', async function() {
    await gv.categorizeProposal(proposalId, 1, 0);
    let proposalData = await gv.proposal(proposalId);
    assert.equal(proposalData[1].toNumber(), 1, "Proposal not categorized");
  });

  it('Should update proposal details', async function() {
    let {logs} = await gv.updateProposal(
      proposalId,
      'Addnewmember',
      'AddnewmemberSD',
      'AddnewmemberDescription'
    );
    let gvAddress = await Governance.deployed();
    const event = expectEvent.inLogs(logs, 'Proposal');
    assert.equal(event.args.proposalTitle, "Addnewmember", "Proposal details not updated");
  });

  it('Should reset proposal category', async function() {
    var proposalDataUpdated = await gv.proposal(proposalId);
    assert.equal(proposalDataUpdated[1].toNumber(), 0, 'Category not reset');
  });

  it('Should not open proposal for voting before categorizing', async() => {
    await assertRevert(gv.submitProposalWithSolution(proposalId, "Addnewmember", "0x4d52"));
  });

  it('Should allow only owner to open proposal for voting', async () => {
    let actionHash = encode(
      'addRole(bytes32,string,address)',
      '0x41647669736f727920426f617265000000000000000000000000000000000000',
      'New member role',
      owner
    );
    await gv.categorizeProposal(proposalId, 1, 0);
    await assertRevert(gv.submitVote(proposalId, 1));
    await assertRevert(gv.submitProposalWithSolution(proposalId, "Addnewmember", actionHash, { from:notOwner}));
    await gv.submitProposalWithSolution(proposalId, "Addnewmember", actionHash);
    assert.equal((await gv.canCloseProposal(proposalId)).toNumber(), 0);
  });

  it('Should not update proposal if solution exists', async function() {
    await assertRevert(gv.categorizeProposal(proposalId, 2, 10^18));
    await assertRevert(gv.updateProposal(proposalId, 'Addnewrole', 'AddnewRoleSD', 'AddnewRoleDescription'));
  });

  it('Should not allow voting for non existent solution', async () => {
    await assertRevert(gv.submitVote(proposalId, 5));
  });

  it('Should not allow unauthorized people to vote', async () => {
    await assertRevert(gv.submitVote(proposalId, 1, { from: notOwner}));
  });

  it('Should submit vote to valid solution', async function() {
    await gv.submitVote(proposalId, 1);
    await assertRevert(gv.submitVote(proposalId, 1));
  });

  it('Should pause proposal', async function() {
    let p = await gv.getProposalLength();
    p = p.toNumber();
    await gv.createProposal(
      'Pause',
      'Pause proposal',
      'Pause proposal',
      0
    );
    await gv.categorizeProposal(p, 6, 0);
    let actionHash = encode(
      'pauseProposal(uint)',
      proposalId
    );
    await gv.submitProposalWithSolution(p, 'Pause proposal', actionHash);
    await gv.submitVote(p, 1);
    await gv.closeProposal(p);
    let isPaused = await gv.proposalPaused(proposalId);
    assert.equal(isPaused, true, "Proposal not paused");
  });

  it('Should not close a paused proposal', async function() {
    await assertRevert(gv.closeProposal(proposalId));
  });

  it('Should resume proposal', async function() {
    let p = await gv.getProposalLength();
    p = p.toNumber();
    await gv.createProposal(
      'Resume',
      'Resume proposal',
      'Resume proposal',
      0
    );
    await gv.categorizeProposal(p, 5, 0);
    let actionHash = encode(
      'resumeProposal(uint)',
      proposalId
    );
    await gv.submitProposalWithSolution(p, 'Resume proposal', actionHash);
    await gv.submitVote(p, 1);
    await gv.closeProposal(p);
    let isPaused = await gv.proposalPaused(proposalId);
    assert.equal(isPaused, false, "Proposal not resumed");
  });


  it('Should close proposal', async function() {
    let canClose = await gv.canCloseProposal(proposalId);
    assert.equal(canClose.toNumber(), 1);
    await gv.closeProposal(proposalId);
  });

  it('Should not close already closed proposal', async function() {
    let canClose = await gv.canCloseProposal(proposalId);
    assert.equal(canClose.toNumber(), 2);
    await assertRevert(gv.closeProposal(proposalId));
  });

  it('Should get rewards', async function() {
    let pendingRewards = await gv.getPendingReward(owner);
    console.log(pendingRewards);
  });

  // it('Should claim rewards', async function() {
  //   await tf.payJoiningFee(owner, { value: 2000000000000000 });
  //   await tf.kycVerdict(owner, true); 
  //   console.log(await nxms.isMember(owner));
  //   console.log(await nxmToken.balanceOf(cr.address));
  //   await cr.claimAllPendingReward([1,2,3]);
  //   let pendingRewards = await gv.getPendingReward(owner);
  //   console.log(pendingRewards);
  // });

});