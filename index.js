'use strict';

const assert = require('assert');
const events = require('events');

const gState = {
    queueSchema : {},
    /**
     * @type {Object.<string, MMQueue>}
     */
    matchQueues : {},
    /**
     * all the tickets waiting for result
     *  @type {Object.<string, MMTicket>}
     */
    allTickets : {},
    debugLog : false,
    /**
     * 
     */
    Tick,
    SetQueueSchema,
    CreateTicket,
    CancelTicket,
    OnMatchReady : function(matchInfo) {},
    OnTicketFailed : function(ticket, error) {},

    GetQueuesBasicStatus,

    Version : '0.1.4'
}

function GenUniqueId(){
    return Math.random().toString(36).substring(7);
}
/*
*/
function GenTicketId(queueName){
    return queueName + '#' + Math.random().toString(36).substring(7);
}
/*
*/
function Lerp(value1, value2, amount) {
    return value1 + (value2 - value1) * amount;
}
/*
alpha must be between 0,1
Example :
ArrayLinearSample([0,10], 0.5) === 5
*/
function ArrayLinearSample(array, alpha){
    const mul = (array.length - 1) * alpha;
    const index = Math.floor(mul);
    const dec = mul - index;
    
    if(dec === 0)
        return array[index];
    else
        return Lerp(array[index], array[index + 1], dec);
}
    
const EMatchTicketFailCodes = {
    Timeout : 'Timeout',
    QueueNotFound : `QueueNotFound`,
    QueueIsFull : `QueueIsFull`,
    QueueDropped : `QueueDropped`,
    ServerFull : `ServerFull`,
    InvalidTicket : `InvalidTicket`,
};

/**
 * 
 * @param {string} queueName name of the match queue
 * @param {object} ticketParams data for the ticket
 * @param {array} ticketUsers array containing parameter of users
 */
function CreateTicket(queueName, ticketParams, ticketUsers){
    const queueSchema = gState.queueSchema[queueName];
    
    const newTicket = new MMTicket(queueName);
    newTicket.users = ticketUsers;
    newTicket.data = ticketParams;

    //
    function FailFunc(error){
        setTimeout(function(){
            gState.OnTicketFailed(newTicket, error);
        }, 1000);
        return newTicket;
    }

    //for simplicity we enqueue the error instead of throwing immediately
    if(!queueSchema)
        return FailFunc(EMatchTicketFailCodes.QueueNotFound);
    
    if(ticketUsers.length === 0 || ticketUsers.length > queueSchema.teamSize)
        return FailFunc(EMatchTicketFailCodes.InvalidTicket);
    




    const queue = Match_GetQueue(queueName);
    queue.AddTicket(newTicket);
    
    return newTicket;
}
function GetQueuesBasicStatus(){
    const result = {};
    
    for(const queueName in gState.matchQueues){
        /**@type MMQueue */
        const matchQueue = gState.matchQueues[queueName];
        const queueStatus = {
            'numUsers' : matchQueue.numUsers,
        }

        result[queueName] = queueStatus;

    }
    return result;
}

function CancelTicket(matchTicketId){
    /**
     * @type MMTicket
     */
    const matchTicket = gState.allTickets[matchTicketId];
    if(matchTicket){
        assert(matchTicket.matchQueue);
        return matchTicket.matchQueue.RemoveTicketById(matchTicketId);
    }
    return false;
}
function SetQueueSchema(queueSchema){

    function FixSchema(schemaObj){
        if(!schemaObj.onTicketsEverMatch)
            schemaObj.onTicketsEverMatch = function(firstTicket, ticket) { return true; }

        if(!schemaObj.onTicketEverJoin)
            schemaObj.onTicketEverJoin = function (team, joiningTicket) { return true; }

        if(!schemaObj.skillCurve)
            schemaObj.skillCurve = [Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER];
    }

    for(const name in queueSchema){
        const schemaObj = queueSchema[name];
        schemaObj.name = name;
        FixSchema(schemaObj);
    }

    gState.queueSchema = queueSchema;
}

function Match_GetQueue(queueName){
    let queue = gState.matchQueues[queueName];
    if(!queue){
        queue = new MMQueue(gState.queueSchema[queueName]);
        gState.matchQueues[queueName] = queue;
    }
    return queue;
}



class MMQueue {
    constructor(queueSchema){
        this.queueSchema = queueSchema;
        //an array of all the MatchTicket in this queue. 
        this.tickets = [];
        //number of users in the queue. might be different than number of tickets
        this.numUsers = 0;
        //the minages stored
        this.accomplishMinAges = [0,0,0,0,0,0,0,0];
    }
    AddTicket(ticket){
        //add to the global map
        gState.allTickets[ticket.ticketId] = ticket;
        //
        ticket.matchQueue = this;
        this.tickets.push(ticket);
        //
        this.numUsers += ticket.users.length;
    }
    RemoveTicketById(ticketId){
        //remove from the global map
        delete gState.allTickets[ticketId];

        const foundIndex = this.tickets.findIndex(function(ticket){ return ticket.ticketId === ticketId });
        if(foundIndex !== -1){
            const theTicket = this.tickets[foundIndex];

            this.numUsers -= theTicket.users.length;
            this.tickets.splice(foundIndex, 1); //remove the ticket from array and keep the order
            
            theTicket.matchQueue = null;
            return true;
        }
        return false;
    }
    Weight_Skill(){
        return 1; //#TODO
    }
}

class MMTicket{
    constructor(queueName){
        this.requestTime = Date.now();
        this.ticketId = GenTicketId(queueName);
        this.matchQueue = null;
        this.users = [];
        this.data = {};
    }

    //returns the max allowed difference for skill diff at current time of this ticket
    Diff_UserSkill(){
        let elapsedAlpha = (Date.now() - this.requestTime) / this.matchQueue.queueSchema.duration;
        elapsedAlpha = elapsedAlpha > 1 ? 1 : elapsedAlpha;
        return ArrayLinearSample(this.matchQueue.queueSchema.skillCurve, elapsedAlpha);
    }

    FailTheTicket(error){
        this.matchQueue.RemoveTicketById(this.ticketId);
        gState.OnTicketFailed(this, error);
    }
    RemoveFromQueue(){
        this.matchQueue.RemoveTicketById(this.ticketId);
    }
}




//returns average skill of the team 
function TeamCalcSkill(team, joiningTicket){
    let sum = 0, numUser = 0;
    for(const ticket of team.tickets){
        for(const user of ticket.users){
            sum += user.skill;
            numUser++;
        }
    }

    if(joiningTicket){
        for(const user of joiningTicket.users){
            sum += user.skill;
            numUser++;
        }
    }

    return sum / numUser;
}
class MMTeam
{
    constructor(teamSize){
        this.tickets = [];
        this.freeCount = teamSize;
        this.teamSize = teamSize;
        this.lastSkill = 0;
    }
}
/*
Size of team is fixed of all,
Rank is based on team rank.
*/ 
class MMCollectionTeamed{
    constructor(firstTicket, queueSchema){
        this.queueSchema = queueSchema;

        this.teams = [];
        this.minSkill = 999999999; 
        this.maxSkill = -9999999;
        this.numFilledTeam = 0; //how many team is full
        this.numJoinedTicket = 0;
        this.numJoinedUser = 0;

        this.minRequestTime = Number.MAX_SAFE_INTEGER;
        this.maxRequestTime = Number.MIN_SAFE_INTEGER;


        this.minTicketElapsedTime = 0;  //the ticket which has the lowest ElapsedTime
        this.maxTicketElapsedTime = 0;  //the ticket which has the highest ElapsedTime

        this.MakeTheTeams(queueSchema.teamSize, queueSchema.maxTeam);
        this.JoinTicketToTeam(firstTicket, this.teams[0]);

    }
    /*
    */
    MakeTheTeams(teamSize, count){
        this.teams = new Array(count);
        this.numFilledTeam = 0;

        for(let i = 0; i < count; i++)
            this.teams[i] = new MMTeam(teamSize);
    }
    /*
    returns the team that ticket can join. null otherwise
    */
    JoinPossible(joiningTicket){
        if(this.queueSchema.mode === 'single_join' && this.numJoinedTicket)
            return null;
        

        if(this.numFilledTeam >= this.queueSchema.maxTeam)
            return null;

        const firstTicket = this.teams[0].tickets[0];
        if(!this.queueSchema.onTicketsEverMatch(firstTicket, joiningTicket))
            return null;
        
        let fullestTeam = null;
        let fullestTeamFreeCount = 9999;

        const possibleTeams = []; //teams that the ticket can join in
        for(const team of this.teams){
            if(this.TeamJoinPossible(team, joiningTicket)){
                team._weight = team.freeCount;
                possibleTeams.push(team);
            }
        }

        //
        if(possibleTeams.length === 0) //no team available to join ?
            return null;

        
        //will sort from lowest to highest
        const sortedTeams = possibleTeams.sort(function(a, b){ return a._weight - b._weight; });
        return sortedTeams[0];
        
    }
    TeamJoinPossible(team, joiningTicket){
        if(team.freeCount < joiningTicket.users.length) //isn't there any empty place for the ticket?
            return false;

        const teamSkill = TeamCalcSkill(team, joiningTicket);

        const newMin = Math.min(this.minSkill, teamSkill);
        const newMax = Math.max(this.maxSkill, teamSkill);
        const newSkillDiff = newMax - newMin;

        if(newSkillDiff > joiningTicket.Diff_UserSkill())
            return false;

        if(!this.queueSchema.onTicketEverJoin(team, joiningTicket))
            return false;

        return true;
    }

    /*
    */
    JoinTicketToTeam(joiningTicket, team){
        team.tickets.push(joiningTicket);
        const teamNewSkill = TeamCalcSkill(team);
        team.lastSkill = teamNewSkill;

        const newMin = Math.min(this.minSkill, teamNewSkill);
        const newMax = Math.max(this.maxSkill, teamNewSkill);
        const newRankDiff = newMax - newMin;

        this.minSkill = newMin;
        this.maxSkill = newMax;

        this.minRequestTime = Math.min(this.minRequestTime, joiningTicket.requestTime);
        this.maxRequestTime = Math.max(this.maxRequestTime, joiningTicket.requestTime);

        team.freeCount = team.freeCount - joiningTicket.users.length;

        if(team.freeCount === 0)
            this.numFilledTeam++;
        
        this.numJoinedTicket++;
        this.numJoinedUser += joiningTicket.users.length;
    }
    //we can say that all tickets have elapsed at least 'MinimumAge' milliseconds
    MinimumAge(){
        return Date.now() - this.minRequestTime;
    }
    MaximumAge(){
        return Date.now() - this.maxRequestTime;
    }
    IsCompleted(){
        //this is used for practice and tutorial game mode usually
        if(this.queueSchema.mode === 'single_join'){
            if(this.teams.length)
                return true;
        }
        else if(this.queueSchema.mode === 'max_team') {
            if(this.numFilledTeam >= this.queueSchema.maxTeam)
                return true;
        }
        
        return false;
    }

    Accomplish(){
        const resolvedTeams = new Array(this.teams.length);
        for(let i = 0; i < this.teams.length; i++){
            const team = this.teams[i];
            

            const resolvedTeam = { 'tickets' : [] };
            resolvedTeams[i] = resolvedTeam;

            for(const ticket of team.tickets){
                ticket.RemoveFromQueue();
                resolvedTeam.tickets.push({
                    'users' : ticket.users, 'data' : ticket.data,
                });
            }
        }

        const result = {
            'matchId' : GenTicketId(this.queueSchema.name),
            'teams' : resolvedTeams,
            'minAge' : this.MinimumAge(),
            'minSkill' : this.minSkill,
            'maxSkill' : this.maxSkill,
            'matchQueueName' :  this.queueSchema.name,
            'buildName' : this.queueSchema.buildName,
        };

        gState.OnMatchReady(result);
    }
}




function Tick(){
    for(const queueName in gState.matchQueues){
        const queue = gState.matchQueues[queueName];
        MatchPullQueue(queue, queue.queueSchema);
    }
}

/*
 */
function MatchPullQueue(queue, queueSchema){

    const curTime = Date.now();

    const collections = [];

    //weight the properties
    for(const ticket of queue.tickets){
        ticket.finalWeight = ticket.lastSkill * queue.Weight_Skill();
    }
    //sort the tickets
    //will sort from lowest to highest
    const ticketsSorted = queue.tickets.sort(function(a, b){ return a.finalWeight - b.finalWeight; });
    
    //for each sorted ticket
    for(const ticket of ticketsSorted){

        let bAddedToCollection = false;
        for(const collection of collections){
            const freeTeam = collection.JoinPossible(ticket);
            if(!freeTeam)
                continue;

            collection.JoinTicketToTeam(ticket, freeTeam);
            bAddedToCollection = true;
            break;
        }
        if(!bAddedToCollection){
            collections.push(new MMCollectionTeamed(ticket, queueSchema));
        }
    }


    let readyCollections = [];
    for(let collection of collections){
        if(collection.IsCompleted())
            readyCollections.push(collection);
    }

    if(readyCollections.length > 0){
    }

    for(let readyCollection of readyCollections){
        readyCollection.Accomplish();
    }




    //remove the time outed tickets
    {
        const timeoutTickets = [];
        for(let iTicket = 0; iTicket < queue.tickets.length; iTicket++){
            const ticket = queue.tickets[iTicket];
            const elapsed = curTime - ticket.requestTime;

            if(elapsed >= queueSchema.duration){
                timeoutTickets.push(ticket);
            }
        }

        for(const ticket of timeoutTickets){
            ticket.FailTheTicket(EMatchTicketFailCodes.Timeout);
        }
    }


}

module.exports = gState;