const gl = 256 * 9
/*
const fs = require("fs")
, d = fs.readFileSync(process.argv[2])
console.log(d.length)
//const c = convertDatatoCas(d, 0)
//fs.writeFileSync("dsk.cas.bin", c)
const dir = getDirectory(d)
console.log(dir[0])
const dd = getDskFileData(d, dir[5])
console.log(dd)
fs.writeFileSync("out.bas", dd)
*/  
const enc = new TextDecoder("utf-8")
function encStr(s) { return new TextEncoder("utf-8").encode(s) }
function decStr(b) { return new TextDecoder("utf-8").decode(b) }

function bufConcat(ba) {
    let o = 0
    for (const i of ba) o += i.length
    const buf = new Uint8Array(o)
    o = 0
    for (const i of ba) {
        buf.set(i, o)
        o += i.length
    }
    return buf
}

function getGran(f, g) {
    if (g > 33) g += 2 // skip t17
    return f.subarray(g * gl, (g + 1) * gl)
}

function getGrans(s, fat) {
    let n = s, g = [n]
    while (n < 68) g.push(n = fat[n])
    return g
}

//from page 57 of the Color Computer disk system Owners Manual & Programing Guide https://colorcomputerarchive.com/repo/Documents/Manuals/Hardware/Color%20Computer%20Disk%20System%20(Tandy).pdf
function getDirectory(d) {
    const td = d.subarray(34 * gl, (34 + 2) * gl)
    let o = 0x200, dir = [], fat = td.subarray(0x100, 0x100 + 68)

    for (let i = 0; i < 72; i++) {
        if (td[o] !== 0xFF && td[o] != 0) {
            const g = getGrans(td[o + 13], fat),
                glen = td[o + 14] & 0xFF << 8 | td[o + 15] & 0xFF,
                size = (g.length - 2) * gl + (g[g.length - 1] - 0xC1) * 256 + glen

            dir.push({
                i: i,
                name: decStr(td.subarray(o, o + 8)).trim(),
                ext: decStr(td.subarray(o + 8, o + 11)).trim(),
                type: td[o + 11],
                ascii: td[o + 12],
                grans: g,
                len: glen,
                size
            })
        }
        o += 32
    }
    return dir
}

function getDskFileData(d, e) {
    let grans = []
    for (let i = 0; i < e.grans.length - 1; i++)
        grans.push(getGran(d, e.grans[i]))
    return bufConcat(grans).subarray(0, e.size)
}

function getDiskData(d, di) {
    const dir = getDirectory(d)
        , d0 = dir[di]
        , buf = getDskFileData(d, d0)
        , mload = buf.subarray(3, 5)
        , mstart = buf.subarray(buf.length - 2, buf.length)
    console.log(dir)
    return { name: d0.name, mload, mstart, buf: buf.subarray(5, buf.length - 5) }
}

function checksum(ba) {
    let sum = new Uint8Array(1)
    for (const i of ba) sum[0] += i
    return sum[0]
}

function convertDatatoCas(d, di) {
    const dd = getDiskData(new Uint8Array(d), di), f = dd.buf,
        fl = Math.floor(f.length / 255) * (255 + 6) + 129 + 129 + 19 + 255 //not exact?
    let o = 129, c = new Uint8Array(fl)

    console.log("fl:", fl, o, dd.name)
    c.fill(0x55, 0, o) //1. A leader consisting of 128 bytes of 55H 
    //2. A Namefile block 
    c.set([0x55, 0x3c, 0, 0x0F,
        ...encStr(dd.name.padEnd(8, " "))
        , 2, 0, 0,
        ...dd.mstart, ...dd.mload
    ], o)

    let cs = checksum(c.subarray(o + 2, o + 19))
    console.log("hcs:", o, cs.toString(16))
    o += 19
    c[o] = cs
    o++

    c.fill(0x55, o, o + 129) //4. A second leader of 128 bytes of SSH
    o += 129

    let bc = Math.floor(f.length / 255)

    let co = 0, bs = 255
    for (let x = 0; x <= bc; x++) { //5. One or more Data blocks 
        console.log(x, o, co, f.length - co)

        if (f.length - co < 255) bs = f.length - co

        c.set([0x55, 0x3c, 1, bs], o)
        o += 4

        c.set(f.subarray(co, co + bs), o)
        cs = checksum(c.subarray(o - 2, o + bs))
        o += bs
        co += bs
        c.set([cs, 0x55], o)
        o += 2
    }
    c.set([0x55, 0x3c, 0xFF, 0, 0xFF], o) //6. An End of File block
    o += 5
    console.log("lb:", bc, o, co, co - f.length)

    return c.subarray(0, o)
}
