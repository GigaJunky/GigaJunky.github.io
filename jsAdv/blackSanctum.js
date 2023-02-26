    /*Copyright 1981 Mark Data Products presents
     The Black Sanctum By: Stephen O'Dea & Bob Withers
     Ported to javascript 2023 by BitJunky
     https://www.myabandonware.com/game/the-black-sanctum-1q3 */


 const events = { minloc: 5, rand: 4,  event: [
     { say: "I hear chanting."},
     { say: "A rat scurries past my feet."},
     {
         inv: ["robe"], loc: 16,
         say: "A figure in a black robe is approaching. He nodes and continues on his way.",
         miss: "A figure in a black robe approaches. He spots me, raises his arms and begins to chant. My body feels paralyzed!",
     }
 ]}

 const gets = [
          {n: "need", inRoom: ["pine trees"], add: [{n:"pine needles",w:1}]}
         ,{n: "feat", inv: ["raven"], add: [{n:"black feather",w:1}]}
         ,{n: "rave", inv: ["net"], inRoom: ["raven"],  miss: "The raven squawks and flies away."}
         ,{n: "snow", inv: ["an empty jug"], chg: ["a jug full of water"], locs:[0,1,2,3],
          say: "The snow melts and fills the jug with water.",
          miss: "The snow melts and gets me all wet. I need a container."
         }
     ]


 var locs = [
     {
         //0
         desc: "I'm in rugged mountain country, Snow is falling",
         d: { n: 1, s: 1, w: 1, cabin: 2 },
         i: [{n:"pine trees",w:-1}, {n:"a cabin in the distance",w:-1}]
     },
     {    //1
         desc: "I'm in rugged mountain country, Snow is falling",
         d: { n: 1, s: 2, w: 0 },
         i: [{n:"pine trees",w:-1}]
     },
     {   //2
         desc: "I'm outside a rustic mountain cabin. Snow is falling",
         d: {w:1, door: { l: 3, status: "c" } },
         i: [{n:"a shovel",w:1} ,{n:"a large wooden door",w:-1}]
     },
     {   //3
         desc: "I'm in the living room of a mountain cabin",
         d: { stairs: 4, door: { l: 2, status: "o"} },
         i: [
             {n:"a jug of wine", w: 1, l: "It tastes like burgandy." },
             {n:"a butterfly net", w: 1},
             {n:"a fireplace", w: -1, l: "It's made of large stones with a wood mantle" },
             {n:"mantle", w: -2,  i: [{ n: "matches", w: 1 }] },
             {n:"a large wooden door",w:-1},
             {n:"a flight of stairs",w:-1},
         ]
     },
     {   //4
         desc: "I'm in a dimly lit bedroom",
         d: { d: 3, "closet doorway": 5 },
         i: [{n:"a closet doorway",w:-1},{n:"a flight of stairs",w:-1},
             { n: "a bed", w: -1, l: "It's queen size with white sheets.", i: [{ n: "a white sheet", w: 1}] },
             {   
                 n: "a young woman", w: 1,
                 l: "She's quite preaty with long dark hair. She apears to be in a trance. There's a note cluched in here hand.",
                 i: [{ n: "a handwritten message", w: 1, l: "It says: They're after me. Remember 'Invocare Episcopus'" }]
             }
         ],
         cut: [{n:"hair",inRoom:["woman"],inv:["shears"], say: "snip.", miss: "I have nothing to cut it with.",
         rooms:[{id: 4,add:[{n: "a lock of hair",w:1}]}]}]
     },
     {   //5
         desc: "I'm in a large closet used for clothes storage",
         d: { w: 4, mirror: 6 },
         i: [
             { n: "a full length mirror", w: -1, l: "It looks like an antique.", break: "game over" },
             { n: "a hooded robe", w: 1, l: "There a strange looking emblem on the sleave."}
         ]
     },
     {   //6
         desc: "I'm in a long narrow corridor",
         d: { s: 7, mirror: 5 },
         i: [{n:"a full length mirror",w:-1}]
     },
     {   //7
         desc: "I'm in a long narrow corridor",
         d: { n: 6, e: 20, w: 19, door: { l: 15, status: "l", unlock:["keys"], miss: "You don't have the key."}},
         i: [{n:"a large wooden door",w:-1},
             {n:"a bronze plaque", w:-1, l: "St. Sebastian Monastery, 1739"}
         ]
     },
     {   //8
         desc: "I'm in a long narrow corridor", d: { n: 19, s: 10, w: 9 }},
     {   //9
         desc: "I'm in a old study",
         d: { s: 20, e: 8 },
         i: [{ n: "bookcases", w: -1, i: [
             { n: "a old manuscript", w: 1,
                r: "A lot of the writing has faded. Here's an intesting entry: 'June 8, 1781 - The bishop has succumbed to the plague. He has been laid to rest in the crypt and the brothers have elected to close the monastery'."},
                { n: "a parchment with musical scoring", w: 1, r: "It's a Bach fuge"}
         ]} ]
     },
     { desc: "I'm at the end of a long narrow corridor",d: { n: 8, e: 12 } }, //10
     { desc: "I'm in a small room", d: { s: 19, w: 21 }, i:[]}, //11
     {   //12
         desc: "I'm in a small alcove", //status: It's now pitch dark. I can't see anything.
         d: { w: 10, door: { l: 17, status: "l", unlock: ["boards"], miss: "There are wooden boards nailed across it." } }, // nailed with boards
         i: [ 
          { n: "a boarded up doorway", w: -1, l: "There are wooden boards nailed across it." },
          { n: "unlit lantern", w: 1 },
          // nails, wooden boards
         ],
         pull: [{
          n: "nails",  inv: ["hammer"], miss: "You don't have something to pull the nails with.", say: "Boy, that was hard work!",
          rooms:[
             {id:12, d:{w:10,door:{l:17,status:"o"}},
              add:[{n:"nails",w:1},{n:"wooden boards",w:1}],
              chg:[{id:0,v:{n:"a doorway",w:-1,l:"It's opened."}}]
             },
             {id:17, d:{n:18,vent:22,door:12},
              chg:[{id:0,v:{n:"large stone steps leading to a doorway",w:-1,l:"It's opened."}}
             ]}
         ],
         }]
     },
     {   //13
         desc: "I'm at the end of a long narrow corridor",
         d: { n: 21, stairs: 14 },
         i: [{n:"a flight of stairs",w:-1}]
     },
     {   //14
         desc: "I'm in a loft at the top of the stairs",
         d: {d:13},
         i: [{n:"a grumpy old man",w:-1},
             {n:"a flight of stairs",w:-1},
             {n:"a ring of keys",w:1},
             {n:"garden shears",w:1},
             {n:"a hand saw",w:1}
         ],
         give:[
             {n:"wine",inv:["wine"],inRoom:["man"],
                 say:"The old man grabs the wine and shuffles down down the stairs.",
                 miss: "You don't have it.",
                 missR: "Nobody to give it to?",
                 Inv: {del:["wine"]},
                 rooms:[
                     {id:14,del:["man"]},
                     {id:11,add:[{n:"a sleeping old man",w:-1},{n:"an empty jug",w:1}]}
                 ]
             }
         ],
         get:[{n:"*", inRoom:["man"], say: `The old man won't let me. He says: "I'm the caretaker, you better leave. They won't like strangers."`, missR: "Get" }]
     },
     {   //15
         desc: "I'm in an impressive room with a cathedral ceiling", d: { n: 7 },
         i: [{ n:"a big manual pipe organ", w: -1, l: "It's an old Praetorius with 32 stops."},
              {n: "stone statues", w: -1, l: "It's eerie... They're so lifelike" } ],
         play: [
             {n:"musi",inv:[],say:"What score?"},
             {n:"orga",inv:[],say:"What should I play?"},
             {n:"bach",inv:["musi"], say:"It makes a magnificent sound. Hey, the organ moved.", miss: "I have no sheet music.",
                 rooms:[{id:15,d:{n:7,passage:22},add:[{n:"a secret passage",w:-1}]}]
             }
         ]
     },
     { desc: "I'm in a strange place." }, //16

     { //17
         desc: "I'm in an arched passage under the monastery", dark: true,
         d: { n: 18, vent: 22, door: { l: 12, status: "l", unlock:["boards"], miss: "doesn't work" } }, i: [
          {n: "large stone steps leading to a doorway", w: -1, l: "The door is nailed shut from the other side",
            unlock: "I can't do that ... now!"},
          { n: "an old vent", l: "It looks like a large air vent", w: -1},
          { n: "steps", w: -2, l: "They lead to a doorway"}
         ]
     },
     {   //18
         desc: "I'm in an underground crypt", d: { s: 17, coff: {n: 18, status: "c"} }, dark: true,
         i: [
             {n: "a coffin", l: "it looks interesting alright!", w: -1, status: "c",
              o: "Gulp... I found a skeleton dressed in ministerial robes"}, // an open coffin
             { n: "skeleton", l: "I think it's the bishop. A strange voice calls my name.", w: -2},
             { n: "a claw hammer", w: 1}
         ],
         list: [
             {n: "*", inRoom: ["alter","sheet","hair","salt","feat","water", "need"],
              rooms:[{id: 18, add: [{ n: "ashes", w: 1}]}],
              missR: 'The image of a figure in white vestments appears and says: "You must exorcise the evil that now lurks here. I will help you turn the devil\'s power against his disciples. You will need an alter crafted by your own hand, a white cloth to cover it, pure water to consecrate it, pine needles, a lock of a maiden\'s hair, a black feather, and salt. Return with these things and I will be here." The apparition then disappears',
              say: `The bishop appears and says "You have done well." He sprinkles water on the alter, extends his arms and the altar burns and turns to ash. "Throw this sanctifed ash in their evil circle and immediately invoke my presence to protect your from the devil's wrath." The apparition then disappears.`
             }
         ],
         make: [{
             n: "alter",
             inRoom: ["hammer","hand saw","nails","boards"], miss: "I can't do that... I'm missing something.", say: "That was hard work!",
             rooms:[{ id:18,
                 add:[{n:"a handcrafted alter",w:-1}],
                 del:["nails","boards"]
             }]
         }]
     },
     { desc: "I'm in a long narrow corridor", d: {n: 11, s: 8, e: 7 }},//19
     { desc: "I'm in a long narrow corridor", d: {n: 9, s: 21, w: 7 }},//20
     { desc: "I'm in a long narrow corridor", d: {n: 20, s: 13, e: 11 }},//21
     {   //22
         desc: "I'm in a very strange room.",
         d: {pass: 15, vent: 17 },
         i: [
             {n: "a large circle on the floor", w: 1, l: "It looks like...It is! It's made of salt", i: [{n: "salt", w: 1}]},
             {n: "a lectern", w: 1, l: "There's an inverted pentacle on the front of it. There appears to be an opening behind it."},
             {n: "a secret passage", w: -1},
             {n: "a raven", w: 1}
         ],
         invo: [
            {n: "epis", inRoom: ["ashes"],
            missR: "something is missing.",
            say: "The building trembles and unearthly shrieks fill the room. A hideous demon appears in the circle as it burst into flames. Congratulations, you've destroyed them. The Adventure is over. ${score} moves where used. Play again? Press [F5]"
         }
         ]
     }
 ]
