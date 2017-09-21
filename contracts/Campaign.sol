pragma solidity ^0.4.6;

import "./Stoppable.sol";

contract Campaign is Stoppable {
    address public sponsor;
    uint    public deadline;
    uint    public goal;
    uint    public fundsRaised;
    uint    public withdrawn;

    struct FunderStruct {
        uint amountContributed;
        uint amountRefunded;
        
    }
    
    mapping (address => FunderStruct) public funderStructs;
    
    modifier onlySponsor () {
        if(msg.sender != sponsor) revert();
        _;
    }
    
    event LogContribution(address sender, uint amount);
    event LogRefundSent(address funder, uint amount);
    event LogWithdrawal(address beneficiary, uint amount);
    

    
    function Campaign(address campaignSponsor, uint campaignDuration, uint campaignGoal){ // Constructor
        sponsor = campaignSponsor;
        deadline = block.number + campaignDuration;
        goal = campaignGoal;
        
    }

    function isSuccess() public constant returns(bool isIndeed){
        return(fundsRaised >= goal);
        
    }

    function hasFailed() public constant returns(bool hasIndeed){
        return(fundsRaised < goal && block.number > deadline);
    }
    
    function contribute() public onlyIfRunning payable returns(bool success) {
        
        if(msg.value==0) revert();
        if(isSuccess()) revert();
        if(hasFailed()) revert();
        fundsRaised += msg.value;
        funderStructs[msg.sender].amountContributed += msg.value;
        //funderStructs.push(newFunder);
        LogContribution(msg.sender, msg.value);
        return true;

    }
    
    function withdrawFunds() public onlySponsor onlyIfRunning returns(bool success) {
        if(!isSuccess()) revert();
        uint amount = fundsRaised - withdrawn;
        withdrawn += amount;
        owner.transfer(amount);
        LogWithdrawal(owner, amount);
        return true;
    }
    
    function requestRefund() public onlyIfRunning returns(bool success){
        uint amountOwed = funderStructs[msg.sender].amountContributed - funderStructs[msg.sender].amountRefunded;
        if(amountOwed == 0) revert();
        if(!hasFailed()) revert();
        funderStructs[msg.sender].amountRefunded += amountOwed;
        if(!msg.sender.send(amountOwed)) revert();
        LogRefundSent(msg.sender, amountOwed);
        return true;
    }
    
}