// Import the page's CSS. Webpack will know what to do with it.
//import "../stylesheets/app.css";
import "../javascripts/_vendor/angular.js";

// Import libraries we need.
import { default as Web3} from 'web3';
import { default as contract } from 'truffle-contract'

// Import our contract artifacts and turn them into usable abstractions.
import hub_artifacts from '../../build/contracts/Hub.json'
import campaign_artifacts from '../../build/contracts/Campaign.json'

// MetaCoin is our usable abstraction, which we'll use through the code below.
var Hub = contract(hub_artifacts);
var Campaign = contract(campaign_artifacts);


// The following code is simple to show off interacting with your contracts.
// As your needs grow you will likely need to change its form and structure.
// For application bootstrapping, check out window.addEventListener below.
var accounts;
var account;

var app = angular.module('HubApp', []);

app.config(function($locationProvider) {
  $locationProvider.html5Mode({
  enabled: true,
  requireBase: false
  });
});

app.controller("HubController",
  [ '$scope', '$location', '$http', '$q', '$window', '$timeout',
  function($scope, $location, $http, $q, $window, $timeout) {


// Everything we do will be inside the App Controller

  var hub;
  var newCampaignWatcher;
  Hub.deployed().then(function(_instance) {
    hub = _instance;
    newCampaignWatcher = watchForNewCampaigns();
  });

  var txn = {};                   // workaround for repetitive event emission (testRPC)
  $scope.campaigns=[];            // array of structs
  $scope.campaignIndex={};        // row pointers
  $scope.campaignLog=[];          // verbose on-screen display of happenings
  $scope.new = {};                // new campaign
  $scope.campaignSelected;        // campaign selector
  $scope.contribution;            // contribution field

  // INTERACTIONS

  // select account

  $scope.setAccount = function() {
    $scope.account = $scope.accountSelected;
    $scope.balance = web3.eth.getBalance($scope.account).toString(10);
    var countCampaigns = $scope.campaigns.length;
    // the "User Contributed" col needs a new context, so recalculate it
    for(var i=0; i<countCampaigns; i++) {
      upsertCampaign($scope.campaigns[i].campaign);
    }
    console.log('Using Account', $scope.account);
  }

  // new campaign

  $scope.newCampaign = function() {
    if(parseInt($scope.new.goal) > 0 && parseInt($scope.new.duration) > 0){
      hub.createCampaign($scope.new.duration, $scope.new.goal, {from: $scope.account, gas: 4000000})
      .then(function(txn){
        $scope.new.goal = "";
        $scope.new.duration = "";
      });
    } else {
      alert('Integers over Zero, please');
    }
  }

  //contribute to the campaign

  $scope.contribute = function() {
    if($scope.campaignSelected=="") return;
    if(parseInt($scope.contribution)<=0) return;
    var campaign = Campaign.at($scope.campaignSelected);
    var amount = $scope.contribution;
    $scope.contribution = "";
    campaign.contribute({from: $scope.account, value: parseInt(amount), gas: 4000000})
    .then(function(txn){
      return;
    });
  }

  // claim a refund

  $scope.refund = function(campaign) {
    var campaign = Campaign.at(campaign);
    return campaign.requestRefund({from: $scope.account, gas: 4000000})
    .then(function(txn){
      // an event will arrive
    });
  }

  // DISPLAY

  // watch hub campaigns created. UI starts here

  function watchForNewCampaigns() {
    hub.LogNewCampaign({}, {fromBlock: 0})
    .watch(function(err, newCampaign) {
      if(err)
      {
        console.error("Campaign Error: ", err);
      } else 
      {
        // normalizing data for output purposes
        console.log("New Campaign", newCampaign);
        newCampaign.args.user = newCampaign.args.sponsor;
        newCampaign.args.amount = newCampaign.args.goal.toString(10);
        // only if non-repetitive (testRPC)
        if(typeof(txn[newCampaign.transactionHash])=='undefined')
        {
          $scope.campaignLog.push(newCampaign);
          txn[newCampaign.transactionHash]=true;
          upsertCampaign(newCampaign.args.campaign);
        }
      }
    })
  };

  // watch functions for each campaign we know about

  // watch receipts

  function watchReceived(address) {
    var campaign = Campaign.at(address);
    var watcher = campaign.LogContribution({}, {fromBlock: 0})
    .watch(function(err, received) {
      if(err)
      {
        console.error('Received Error', adddress, err);
      } else {
        console.log("Contribution", received);
        if(typeof(txn[received.transactionHash+'rec'])=='undefined')
        {
          received.args.user = received.args.sender;
          received.args.amount = parseInt(received.args.amount);
          received.args.campaign = address;
          $scope.campaignLog.push(received);
          upsertCampaign(address);
          txn[received.transactionHash+'rec']=true;
        }
      }
    });
  }

  // watch refund

  function watchRefunded(address) {
    var campaign = Campaign.at(address);
    var watcher = campaign.LogRefundSent({}, {fromBlock: 0})
    .watch(function(err, refunded) {
      if(err)
      {
        console.error('Refunded Error', address, err);
      } else {
        console.log("Refund", refunded);
        if(typeof(txn[refunded.transactionHash+'ref'])=='undefined')
        {
          refunded.args.user = refunded.args.funder;
          refunded.args.amount = parseInt(refunded.args.amount);
          refunded.args.campaign = address;
          $scope.campaignLog.push(refunded);
          upsertCampaign(address);
          txn[refunded.transactionHash+'rec']=true;
        }
      }
    });
  }

  // update display (row) and instantiate campaign watchers
  // safe to call for newly discovered and existing campaigns that may have changed in some way

  function upsertCampaign(address) {
    console.log("Upserting campaign", address);
    getCurrentBlockNumber();
    var campaign = Campaign.at(address);
    var campaignDeadline;
    var campaignGoal;
    var campaignFundsRaised;
    var campaignIsSuccess;
    var campaignHasFailed;
    var campaignWithdrawn;
    var campaignSponsor;

    return campaign.deadline.call({from: $scope.account})
    .then(function(_deadline){
      campaignDeadline = _deadline;
      return campaign.goal.call({from: $scope.account})
    }).then(function(_goal){
      campaignGoal = _goal;
      return campaign.fundsRaised.call({from: $scope.account})
    }).then(function(_fundsRaised){
      campaignFundsRaised = _fundsRaised;
      return campaign.withdrawn.call({from: $scope.account})
    }).then(function(_withdrawn){
      campaignWithdrawn = _withdrawn;
      return campaign.sponsor.call({from: $scope.account})
    }).then(function(_sponsor){
      campaignSponsor = _sponsor;
      return campaign.isSuccess.call({from: $scope.account})
    }).then(function(_isSuccess){
      campaignIsSuccess = _isSuccess;
      return campaign.hasFailed.call({from: $scope.account})
    }).then(function(_hasFailed){
      campaignHasFailed = _hasFailed;

      // build a row step-by-step

      var c ={};
      c.campaign    = address;
      c.sponsor     = campaignSponsor;
      c.goal        = campaignGoal.toString(10);
      c.deadline    = parseInt(campaignDeadline.toString(10));
      c.accepted    = parseInt(campaignFundsRaised.toString(10));
      c.withdrawn   = parseInt(campaignWithdrawn.toString(10));
      c.isSuccess   = campaignIsSuccess;
      c.hasFailed   = campaignHasFailed;
      c.status      = "open";
      if(c.isSuccess) c.status = "success";
      if(c.hasFailed) c.status = "failed";


      if(typeof($scope.campaignIndex[address]) == 'undefined')
        {
          $scope.campaignIndex[c.campaign]=$scope.campaigns.length;
          $scope.campaigns.push(c);
          var recieveWatcher = watchReceived(address);
          var refundWatcher  = watchRefunded(address);
          $scope.$apply();
        }else
        {
          var index = $scope.campaignIndex[c.campaign];
          $scope.campaigns[index].accepted  = c.accepted;
          $scope.campaigns[index].refunded  = c.refunded;
          $scope.campaigns[index].withdrawn = c.withdrawn;
          $scope.campaigns[index].isSuccess = c.isSuccess;
          $scope.campaigns[index].hasFailed = c.hasFailed;
        }
        return getFunder(address);      
      });
  }


  // Check contributions from the current user

  function getFunder(address) {
    var campaign = Campaign.at(address);
    var index = $scope.campaignIndex[address];
    return campaign.funderStructs.call($scope.account, {from: $scope.account})
    .then(function(funder) {
      // when a function returns multiple values, we get an array
      $scope.campaigns[index].userAccepted = parseInt(funder[0].toString(10));
      $scope.campaigns[index].userRefunded = parseInt(funder[1].toString(10));
      $scope.$apply();
      return true;;
    })
  }

  // get the block number

  function getCurrentBlockNumber() {
    web3.eth.getBlockNumber(function(err, bn) {
      if(err) {
        //console.log("error getting block number", err);
      } else {
        //console.log("Current Block Number", bn);
        $scope.blockNumber = bn;
        $scope.$apply();
      }
    })
  }
      // work with the first account

      web3.eth.getAccounts(function(err, accs) {
        if(err !=null) {
          alert("There was an error fetching your accounts.");
          return;
        }
        if(accs.length==0) {
          alert("Couldn't get any accounts. Make sure your Ethereum client is configured correctly.")
          return;
        }
      $scope.accounts = accs;
      $scope.account = $scope.accounts[0];
      $scope.balance = web3.eth.getBalance($scope.account).toString(10);
      console.log("using account", $scope.account);
     });

  }]); // End App Controller

window.addEventListener('load', function() {
  // Checking if Web3 has been injected by the browser (Mist/MetaMask)
  if (typeof web3 !== 'undefined') {
    console.warn("Using web3 detected from external source. If you find that your accounts don't appear or you have 0 MetaCoin, ensure you've configured that source properly. If using MetaMask, see the following link. Feel free to delete this warning. :) http://truffleframework.com/tutorials/truffle-and-metamask")
    // Use Mist/MetaMask's provider
    window.web3 = new Web3(web3.currentProvider);
  } else {
    console.warn("No web3 detected. Falling back to http://localhost:8545. You should remove this fallback when you deploy live, as it's inherently insecure. Consider switching to Metamask for development. More info here: http://truffleframework.com/tutorials/truffle-and-metamask");
    // fallback - use your fallback strategy (local node / hosted node + in-dapp id mgmt / fail)
    window.web3 = new Web3(new Web3.providers.HttpProvider("http://localhost:8545"));
  }

  Hub.setProvider(web3.currentProvider);
  Campaign.setProvider(web3.currentProvider);

});