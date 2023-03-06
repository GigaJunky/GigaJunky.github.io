
adv = {
    info : {
        "Copyright": "1983 Mark Data Products",
        "Title": "Shenanigans",
        "By": "Stephen O'Dea & Bob Withers",
        "Ported": "to javascript 2023 by BitJunky",
        "Ref": "https://www.myabandonware.com/game/shenanigans-57"
    },
    events:[],
    gets: [],

    locs:[
        { id:0, desc: "You are in a small efficiency aprtment",
        d:{ wind: { l: 1, status: "c" }, door: { l: 2, status: "c" } }
        //open window = Whew, that's hard work
        ,i: [
              { n: "an old brass bed", w: -1, l: "there is nothing on the bed", i: [{ n: "shoes", w: 1 }]} 
            , { n: "a dresser", w: -1
            , i: [
                   { n:"a flashlight", w: 1 }
                 , { n:"a wallet", w: 1, i: [{ n: "$102 U.S. currency.", w: 1 }]}
            ]} 
            ,{n: "a wooden valet", w: -1, i: [{n: "jeans & a shirt", w: 1}]}
            ,{n: "a closed window", w: -1}
            ,{n: "a door", w: -1}
        ]},{
            id: 1, desc: "Your are on a fire escape. Before you is a large city."
            , d: { window: 0 }
            , i: [
                 { n: "an advertising billboard", w:-1, l: "In the title one name stands out... The rest is too faded."}
                ,{ n: "an open window", w:-1 }
            ]
        },
        { id: 2, desc: "You are in a dimly lit hallway."
        , d: { n: 3, window: 0, door: 1 }
        , i: [
             { n: "a closed window", w: -1, l: "Won't budge!" }
            ,{ n: "a open door", w: -1, l: "It's room 203." }
            ]
        },
        { id: 3, desc: "You are at the top of an old staircase."
            , d: {s: 2, d: 4}
            , i: [
                { n: "the landlord.", w: -1}
                // 'The landlord says: "Your rent is long overdue". He is standing there blocking your way!'
                // give rent = You don't have enough money. The landloard thanks you and walks away.
            ]
            , "give": [
                {
                  "n": "rent", "inv": ["curr"], "inRoom": ["landlord"],
                  "say": "The landlord thanks you and wlks away.",
                  "miss": "You don't have it.",
                  "missR": "Nobody to give it to?",
                  "Inv": {"del": ["money"]}
                }
              ],
        },
        {id: 4, n: "You are in the vestibule at the bottom of the stairs."
        , d: { n:5,  u: 3}
        , i: [{ n: "mail boxes.", w: -1}]
        }


    ]

}