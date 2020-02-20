
const MPMatch = require('../index');
MPMatch.debugLog = true;

setInterval(function(){
    MPMatch.Tick();
}, 1000);

const schema = {
    'advanced-play' : {
        'teamSize' : 3,
        'maxTeam' : 20,
        'minTeam' : 20,
        'duration' : 120,
        'skillCurve' : [0, 100, 300, 300, 300],
        'mode' : 'max_team',

        'onTicketsEverMatch' : function(firstTicket, joiningTicket){
            return firstTicket.data.map === joiningTicket.data.map;
        },
        'onTicketEverJoin' : function(team, joiningTicket){
            //team must have at least one ticket. and the ticket must have at least one user
            if(team.tickets[0].data.race !== joiningTicket.data.race)
                return false;

            return true;
        }
    },
    'apex-practice' : {
        'teamSize' : 3,
        'maxTeam' : 1,
        'minTeam' : 1,
        'duration' : 20,
        'mode' : 'single_join',
    },
    'apex-tutorial' : {
      'teamSize'  : 1,
      'maxTeam' : 1,
      'minTeam' : 1,
      'duration' : 10,
      'mode' : 'single_join',
    },
    'apex-play' : {
        'teamSize' : 3,
        'minTeam' : 20,
        'maxTeam' : 20,
        'duration' : 10,
        'mode' : 'max_team',
    }
};

MPMatch.SetQueueSchema(schema);

function Test1(){
    //MPMatch.CreateTicket('apex-practice', { map : 'jungle'}, [ {skill:0, userId:1}, ]);
    //MPMatch.CreateTicket('apex-practice', { map : 'jungle'}, [ {skill:0, userId:2}, {skill:0, userId:3}]);

    if(0){
        MPMatch.CreateTicket('apex-tutorial', {}, [ { skill : 0, userId : 10 } ]);
        MPMatch.CreateTicket('apex-tutorial', {}, [ { skill : 0, userId : 20 } ]);
    }

    if(1){
        for(let i = 0; i < 59; i++){
            MPMatch.CreateTicket('apex-play', {}, [{ 'userId' : i, 'skill' : 0, }]);
        }
    }

    MPMatch.OnTicketFailed = function(params){
        console.dir({'OnTicketFailed' : {params}}, [{depth:22}]);
    }


    MPMatch.OnMatchReady = function(params){
        console.dir({'OnMatchReady' : {params}}, [{depth:22}]);
    }
}


Test1();