/*
const fs = require("fs")
, d = fs.readFileSync(process.argv[2])
, c = convertDatatoCas(d)
fs.writeFileSync("dsk.cas.bin", c)
*/

function lastFFByte(b)
{
    let e = b.length -1
    while(b[e] === 255) e--
    e++
    return e
}
function isTrackEmpty(t){
    for (let x = 0; x < t.length; x++) if(t[x]!==255) return false
    return true
}
function getTrack(f,t){ const tl = 256 * 18; return f.subarray(t * tl, (t + 1) * tl) }
function encStr(s){return new TextEncoder("utf-8").encode(s) }
function decStr(b){return new TextDecoder("utf-8").decode(b)}

function checksum(ba){
    let sum = new Uint8Array(1)
    for (const i of ba) sum[0] +=i
    return sum[0]
}

function getDiskData(d)
{
    console.log("getDiskData:", d)
    const name = decStr(d.subarray(0x13400, 0x1340B))
    console.log("DSK Name:", name)

  let tracks = [], to = [16,18,15,19,14,20,13,21,12,22,11,23]
    for (const t of to) {
        let td = getTrack(d,t)
        if(isTrackEmpty(td))break
        tracks.push(td)
    }
    let lt = tracks.length -1
    let lb = lastFFByte(tracks[lt])
    tracks[lt] = tracks[lt].subarray(0, lb)
    //const buf = Buffer.concat(tracks)
    const buf = bufConcat(tracks)
    

    const mload = buf.subarray(3,5)
    , mstart = buf.subarray(buf.length -2, buf.length)

    return { name, mload, mstart, buf: buf.subarray(5, buf.length -5) }
    
}

function bufConcat(ba)
{
    let o = 0
    for (const i of ba)o+= i.length
    const buf = new Uint8Array(o)
    o = 0
    for (const i of ba) {
        buf.set(i, o)
        o+=i.length
    }
    return buf
}

function convertDatatoCas(d){
    const dd = getDiskData(new Uint8Array(d))
    , f = dd.buf
    const fl = Math.floor((f.length - 10)/255) * (255 + 6) + 129 + 129 + 21 + 5 + 250 //todo: not 100%?
    let so = 129
    console.log("fl:", fl, so, dd.name)
    let c = new Uint8Array(fl)
    
    let o = so
    c.fill(0x55, 0, o)
    c.set([0x55,0x3c,0,0x0F,
        ...encStr(dd.name.substring(0,8))
        ,2,0,0,
        ...dd.mstart,...dd.mload
    ],o)
    o+=19
    
    console.log(c.subarray(so+2, so+2+13+4))
    let hcs = checksum(c.subarray(so+2,so+2+13+4))
    console.log("hcs:",o, hcs.toString(16))
    
    c[o] = hcs
    o++
    
    c.fill(0x55, o, o+129)
    o+=129
    
    let bc = Math.floor(f.length / 255)
    
    let co = 0
    for (let x = 0; x <= bc; x++) {
        console.log(x, o, co, f.length -co)
        if(f.length - co < 255){
            bs = f.length - co;
            let cs = checksum(f.subarray(co, co+bs))
            console.log('BS:', bs.toString(16), cs.toString(16))
        }else bs = 255
    
        c.set([0x55, 0x3c, 1, bs], o)
        o+=4
        c.set(f.subarray(co, co + bs),o)
        let cs = checksum(f.subarray(co, co+bs))
        o+=bs
        co+=bs
        c.set([cs, 0x55], o)
        o+=2
    }
    
    console.log("lb:", bc,  o, co, co - f.length)
    
    c.set([0x55, 0x3c, 0xFF, 0, 0xFF], o)
    o+=5
    return c    
}

