let currentLoc = 0, turns = 0, light = { on: false, t: 40 }, maxinv = 5, inv = []
//for nodejs console
if (typeof window === 'undefined'){
    const fs = require("fs")
    ,readline = require('readline')
    ,adv = JSON.parse(fs.readFileSync("blackSanctum.json"))
    locs = adv.locs, events = adv.events, gets = adv.gets

    for (const i in adv.info) {
        console.log(i, adv.info[i])
    }
    console.log()

    let rl = readline.createInterface(process.stdin, process.stdout)

    rl.on('line', function (line) {
        console.log(Parser(line))
    })

    function TestWalkThru(fn){
        const steps = fs.readFileSync(fn).toString().split(/\r?\n/)
        console.log(steps)
        
        for (const step of steps) {
            console.log(">" + step)
            if(step[0]!="#")console.log(Parser(step))
        }
        
    }

    TestWalkThru("blackSanctumWalkThru1.txt")
}


    function CheckEvents() {

        if (currentLoc > events.minloc && getRandomInt(events.rand) == 0){
            const e = events.event[getRandomInt(events.event.length)]
            if(Missing(inv, e.inv)){
                currentLoc = e.loc
                return e.miss
            } 
            return e.say
        }
        return ""
    }

    function parseItems(){
        for (let x = 0; x < locs.length; x++){
            let items = []
            if(locs[x].i){
                for (let i of locs[x].i) 
                    if(typeof i === "string")
                        items.push({ n: i, w: -1})
                    else {
                        i.loc = x
                        items.push(i)
                    }
                locs[x].i = items
            }
        }
        console.log(locs)
    }

    function Parser(input) {
        turns++
        if(light.on) light.t-=1

        if (input.trim() === "") return Look()

        let cmds = input.toLowerCase().split(' ').map(i => i.trim())

        if ("newsud".indexOf(cmds[0]) >= 0) return Go(cmds[0])
        const verb = cmds[0].substring(0,4), cl = locs[currentLoc]
        const noun = cmds.length >1 ? cmds[1].substring(0,4) : ""

        switch (verb) {
            case "scor": return `${turns} moves used.`
            case "i": return Inventory()
            case "l":
            case "look": //todo read
                 return Look(noun)
            case "go": return Go(noun)
            case "drop": return Drop(noun)
            //case "get": return Get(noun)
            case "open": return Open(noun)
            case "clos": return Clos(noun)
            case "unlo": return Unlo(noun)
            case "ligh": return Light(noun)
            case "unli": return UnLight(noun)

            case "cut":
            case "clos":
            case "get":
            case "give":
            case "invo":
            case "list":
            case "make":
            case "play":
            case "pull":

            if(!cl[verb]) return fnCall(verb[0].toUpperCase() + verb.slice(1), noun)
                let t = cl[verb].find(f=> f.n.includes(noun))
                if(!t) t = cl[verb].find(f=> f.n === "*")
                if(t){
                    if(t.n === "*" || t.n.includes(noun)){
                        if(Missing(cl.i, t.inRoom)) return fnCall(t.missR || "I don't see it.", noun)
                        if(Missing(inv, t.inv))     return t.miss  || "I don't have it." 

                        if(t.Inv && t.Inv.del)
                            for(const d of findIndexes(inv, t.Inv.del).reverse()) 
                                inv.splice(d,1)

                        if(t.rooms)
                            for(const r of t.rooms){
                                const tl = locs[r.id]
                                if(r.d) tl.d = r.d

                                if(r.del)
                                    for(const d of findIndexes(tl.i, r.del).reverse()) 
                                        tl.i.splice(d,1)

                                if(r.add) tl.i = tl.i.concat(r.add)

                                if(r.chg)
                                    for (const c of r.chg)
                                        tl.
                                        i[c.id] = c.v
                            }
                        return t.say
                    }
                }
                return "Don't be rediculus."

            // drink, taste
            //drink wine return "It tastes like burgandy."
            //There's water in it.
            //It's getting cold in here, maybe I should close the door.

            default: return `I don't understand ${input}.`
        }
    }

    function findIndexes(inv, items){
        let c = []
        for (const i of items)
            c.push(inv.findIndex(a => a.n.includes(i)))
        return c
    }

    function Missing(inv, required){
        if(!inv || !required) return false
        return findIndexes(inv, required).filter(f => f <0).length >0
    }

    function fnCall(fn, noun)
    {
        if(fn == "Get")return Get(noun)
        else return fn+noun 

    }

    function fnCallN(fn, noun)
    {
        if (fn in global && typeof global[fn] === "function") {
            return global[fn](noun)
          }
          else return fn + noun
    }

    function fnCallB(fn, noun)
    {
        f = window[fn]
        if (typeof f === "function") return f(noun)
        else return fn + noun
    }

    function Look(i) {
        const l = locs[currentLoc]

        if (!i){ //room
            if(locs[currentLoc].dark)
                if (!light.on) return "It's now pitch black. I can't see anything. It's dangerous to move around in the dark!"
            return `${CheckEvents()} ${l.desc}.
${ObDirs(l.d)}
${ISee(l)}`
        }

        var el = l.i.find(a => a.n.includes(i))
        if(el){
            if(el.i && el.i.length > 0){
                l.i.push(el.i.shift())
                return 'Hey, I found somthing!'
            }
            if(el.l) return el.l

             return "I see nothing special."

        } else{
            var el = inv.find(a => a.n.includes(i))
            if(el)
                if(el.l) return el.l
                else return "I see nothing special."
            return "I don't see it."

        }
        return "I see nothing special."
    }

    function lookup(a) {
        let n = { n: "North", e: "East", s: "South", w: "West", u: "Up", d: "Down",
          o: "opened", c: "closed", l: "locked"}
        return n[a] ? n[a] : ""
    }

    function ObDirs(d) {
        if (!d) return ""
        var ds = Object.keys(d).map(k => lookup(k)).filter(f => f)
        return ds.length ? "Obvious directions: " +  ds.join(", ") : ""
    }

    function ISee(l) {
        let items = []
        if (l.i) for (const i of l.i) if(i.w > -2) items.push(i.n)
        return `I see: ${items.join(", ")}.`
    }

    function ISeeOld(l) {
        if (!l.i && !l.h) return ""
        let i = l.i, h = l.h
        if (!i) i = []
        if (!h) h = []
        return `I see: ${i.concat(h).join(", ")}.`
    }

    function Inventory() {return `I am carrying the following:\n${inv.map(i => i.n).join(",\n")}.`}

    function Go(direction) {
        // todo: Something wont fit (boards)
        if (!direction || !locs[currentLoc].d) return Look()
        const dn = Object.keys(locs[currentLoc].d).find( f => f.includes(direction))
        const d = locs[currentLoc].d[dn]
        
        if (!d || dn.length > 1 && direction.length < 3) return "I see no way to go in that direction."

        if (typeof d === "number")
            currentLoc = d
        else
            if (d.status && d.status === "o") currentLoc = d.l
            else
                return `It's ${lookup(d.status)}.`

        return Look()
    }

    function Light(i){
        let l = carry("unlit lantern")
        if(i.substr(0,4) === "lant" && carry("matches") !== -1 && l !== -1){
            light.on = true
            inv[l].n = "lit lantern"
            return "It's lit"
        }
        return `I don't understand light ${i}`
    }

    function UnLight(i){
        let l = carry("lit lantern")
        if(i === "lant" && l !== -1){
            light.on = false
            inv[l].n = "unlit lantern"
            return "It's off"
        }
        return `I don't understand unlight ${i}`
        //todo: I fell down and cracked my head. I'm dead! This adventure is over. ?? moves where used. Play again (Y/N)?
    }

    function carry(i){ return inv.findIndex(a => a.n == i)}

    function Get(i) {
        const l = locs[currentLoc]

        if (!l.i) return "I don't see anything."
        if(inv.findIndex(a => a.n.includes(i))>=0) return "I allready have it."
        if(inv.length >= maxinv) return "I can't carry anymore."


        if(i === "all"){
            for (let x =  l.i.length -1; x >=0; x--){
                if(inv.length >= maxinv) return "I can't carry anymore."
                if(l.i[x].w >= 0){
                    inv.push(l.i[x])
                    l.i.splice(x, 1)
                }
            }
            return Look()
        }

        const g = gets.find(f=> f.n.includes(i))
        if(g){
            if(!g.locs || g.locs.includes(currentLoc))
                if(!Missing(inv, g.inv) && !Missing(l.i, g.inRoom)){
                    if(g.add){
                        inv = inv.concat(g.add)
                        return "Ok."
                    }
                    if(g.chg){
                        c = 0
                        for(const i of findIndexes(inv, g.inv)) {
                            inv[i].n =  g.chg[c++]
                        }
                        return g.say
                    }
                } else return g.miss
        }

        var el = l.i.findIndex(a => a.n.includes(i))
        if (el < 0) return "I don't see it."
        if(l.i[el].w >= 0){
            inv.push(l.i[el])
            l.i.splice(el, 1)
        }else return "It's beyond my power to do that."

        return Look()
    }

    function Drop(i) {
        const l = locs[currentLoc]
        if(i === "all"){
            l.i = l.i.concat(inv)
            inv = []
            return Look()
        }
        var el = inv.findIndex(a => a.n.includes(i))
        if (el < 0) return "I don't have it."
        if (!l.i) l.i = []
        l.i.push(inv[el])
        inv.splice(el, 1)
        return Look()
    }

    function Open(i){return SetDoor(i,'o')}
    function Clos(i){return SetDoor(i,'c')}
    function Unlo(i){return SetDoor(i,'o')}

    function SetDoor(i, state) {
        const l = locs[currentLoc]
        const d = (l.d && l.d[i] && l.d[i].status) ? l.d[i] : null
        if(!d) return "I can't do that"
        if(d.status === "l" && Missing(inv, d.unlock)) return d.miss || `It't ${lookup(d.status)}.`
        d.status = state
        return `It't ${lookup(d.status)}.`
    }

    function getRandomInt(max) { return Math.floor(Math.random() * max) }
    function range(size, startAt = 0) { return [...Array(size).keys()].map(i => i + startAt)}