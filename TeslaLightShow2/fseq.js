//https://github.com/Cryptkeeper/fseq-file-format

class FSeq {
    Identifier = 'PSEQ'
    ChannelDataOffset = 32
    MinorVersion = 0
    MajorVersion = 2
    HeaderLength = 32
    ChannelCount = 48
    FrameCount = 0
    StepTime = 20
    Flags = 0   
    Compression = 0
    CompressionBlockCount = 0
    SparseRangeCount = 0
    Reserved = 0
    UniqueID = 0
    vars = []
    data = []
    
    constructor() {
    }

    encStr (s) {return new TextEncoder("utf-8").encode(s) } 
    decStr (b) {return new TextDecoder("utf-8").decode(b)}
    convert16(n) { return  new Uint8Array(new Uint16Array([n]).reverse().buffer) }
    
    convertIntToBytes(int, blen)
    {
        let a= new Uint8Array(blen)
        ,sHex = int.toString(16).padStart(blen * 2,'0')
        for (let i = 0; i < blen; i++)
            a[i] = parseInt(sHex.substr(i*2,2),16) 
            //a.push(parseInt(sHex.substr(i*2,2),16))
        return a
    }

    readHeader(ab){
        console.log(ab.length)
        const enc = new TextDecoder("utf-8")
        this.Identifier = enc.decode(ab.subarray(0, 4))
        this.ChannelDataOffset = this.readInt(ab.subarray(4,5))
        this.MinorVersion = ab[6]
        this.MajorVersion = ab[7]
        this.HeaderLength = this.readInt(ab.subarray(8,9))
        this.ChannelCount = this.readInt(ab.subarray(10,13))
        this.FrameCount = this.readInt(ab.subarray(14,17))
        this.StepTime = ab[18]
        this.Flags = ab[19]
        this.Compression = ab[20]
        this.CompressionBlockCount = ab[21]
        this.SparseRangeCount = ab[22]
        this.Reserved = ab[23]
        this.UniqueID = this.readInt(ab.subarray(24,31))
        this.duration_s = this.FrameCount * this.StepTime / 1000
        const e = valTesla(h)
        console.log('readHeader errors:', e, h)
        console.log('timestamp:', this.UniqueID, new Date(this.UniqueID / 1000) )

        if(e.length > 0) return
        this.vars = this.getVars(ab.subarray(this.HeaderLength, this.ChannelDataOffset-1))
        this.data = ab
        for (const v of this.vars)  console.log(v.d)
        let sz = this.duration_s * ( 1000 / this.StepTime) * this.ChannelCount + this.ChannelDataOffset
        console.log('sz:', sz, this.data.length)
        this.MemoryUsed = this.memoryUsed()

        //this.ChToggleCount()
    }

    writeBuf()
    {
        let d = this.data
        d.set(this.encStr('PSEQ'), 0)
        d.set(this.convert16(this.ChannelDataOffset), 4)
        d[7] = this.MajorVersion
        d.set(this.convert16(this.HeaderLength), 8)
        d.set(this.convertIntToBytes(this.ChannelCount, 4).reverse(), 10)
        d.set(this.convert16(this.FrameCount), 14)
        d[18] = this.StepTime
        d.set(this.convertIntToBytes(this.UniqueID, 8).reverse(), 24)
        this.writeVars()
    }

    getVars(v)
    {
        const enc = new TextDecoder("utf-8")
        let o = 0, vs = []
        while(o < v.length -4){
            let l = this.readInt(v.subarray(o, o+1))
            , c = enc.decode(v.subarray(o+2, o+4))
            , d = enc.decode(v.subarray(o+4,o+l-1))
            o += l
            vs.push({l, c, d})
        }
        return vs
    }

    writeVars()
    {
        let o = this.HeaderLength
        ,d = this.data
        for (const v of this.vars) {
            d.set(this.convert16(v.l + 4), o)
            d.set(this.encStr(v.c), o+2)
            d.set(this.encStr(v.d), o+4)
            o+= v.l + 4 
        }
    }

    create(duration_s, vars)
    {
        this.Identifier = 'PSEQ'
        //this.ChannelDataOffset = 0
        this.MinorVersion = 0
        this.MajorVersion = 2
        this.HeaderLength = 32
        this.ChannelCount = 48
        //this.FrameCount = 0
        this.StepTime = 20
        this.Flags = 0
        this.Compression = 0
        this.CompressionBlockCount = 0
        this.SparseRangeCount = 0
        this.Reserved = 0
        this.UniqueID =  parseInt(Date.now() * 1000)
        

        //this.vars.push( { c: 'mf', d: name, l: name.length + 1})
        //const sp = 'Tesla Light Show Player 2022.01'
        //const sp = 'xLights Macintosh 2021.40'

        let vsum = 0
        for (const v of vars){
            v.l = v.d.length + 1
            vsum += v.l
        }
        this.vars = vars

        this.duration_s = duration_s
        this.ChannelDataOffset = vsum + this.HeaderLength
        this.FrameCount = duration_s * (1000 / this.StepTime )

        let bufsz = duration_s * ( 1000 / this.StepTime) * this.ChannelCount + this.ChannelDataOffset
        console.log('bufsz:', bufsz, this.data.length, vsum)
        this.data = new Uint8Array(bufsz)
        console.log('c16:', this.convert16())
        this.writeBuf()
    }

    clear() { this.data.fill(0,this.ChannelDataOffset, this.data.length) }

    readInt(array) {
        let value = 0
        for (let i = array.length -1; i >= 0 ; i--) //little endian
            value = (value * 256) + array[i]
        return value    
    }

    LastNonZero(){
        let i = this.data.length
        while(i > 0) if(this.data[--i] !=0) break
        console.log('LastNonZero:', i, this.data.length - i)
        return i
    }

    ChToggleCount1() {
        let  chs = new Array(this.ChannelCount),
        priorVal = new Array(this.ChannelCount)
        
        for (let f = 0; f < this.FrameCount; f++) {
            let os =  f * this.ChannelCount  + this.ChannelDataOffset
            for (let ch = 0; ch < this.ChannelCount; ch++) {

                if(!chs[ch]) chs[ch] = [{ value: 0, startTime: 0, endTime: 0 }]
                let chVal = this.data[os + ch]
                ,priorCh = chs[ch][chs[ch].length-1]

                if(chVal != priorCh.value){
                    priorVal[ch] = chVal
                    chs[ch].push({ value: chVal, startTime: priorCh.endTime, endTime: f })
                }
            }
        }
        return chs
    }

    memoryUsed() {
        let prev_light = [], prev_ramp = [], prev_closure1 = [], prev_closure2 = [],
         counts = { MEMORY_LIMIT: 681, Lights:0, Ramps:0, Closures1: 0, Closures2: 0 }

        for (let f = 0; f < this.FrameCount; f++) {
            let os = f * this.ChannelCount  + this.ChannelDataOffset
            , lights = this.data.subarray(os, os+30)
            , ramps = this.data.subarray(os, os+14)
            , closures = this.data.subarray(os+30, os+30+16)
            , light_state = lights.map(b => b > 127)
            , ramp_state = ramps.map(b => Math.min(((b>127 ? 255-b : b)/13+1)/2, 3))
            , closure_state = closures.map(b => ((b / 32 + 1) / 2))

            if (!equals(light_state, prev_light)){
                prev_light = light_state
                counts.Lights++
            }
            if (!equals(ramp_state, prev_ramp)){
                prev_ramp = ramp_state
                counts.Ramps++
            }
            let closure1_state = closure_state.subarray(0,10)
            if (!equals(closure1_state, prev_closure1)){
                prev_closure1 = closure1_state
                counts.Closures1++
            }
            let closure2_state = closure_state.subarray(10,16)
            if (!equals(closure2_state, prev_closure2)){
                prev_closure2 = closure2_state
                counts.Closures2++
            }
        }   
        counts.Total = counts.Lights + counts.Ramps + counts.Closures1 + counts.Closures2
        console.log(`Found ${this.FrameCount} frames, step time of ${1000/this.StepTime} ms for a total duration of ${this.duration_s} seconds.`)
        console.log(`Used ${counts.Total}/${counts.MEMORY_LIMIT}, ${(counts.Total/counts.MEMORY_LIMIT*100).toFixed(2)}% of the available memory`)
        return counts
    }
}


function equals(a, b) { return a.length === b.length && a.every((v, i) => v === b[i])}
