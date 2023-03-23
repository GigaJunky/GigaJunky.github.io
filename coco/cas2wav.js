    /*
        CocoCas2wav.js v1.0 - Ported to Javascript by Bitjunky 2023-03-13
        Based on source cas2wav.c from http://www.6809.org.uk/dragon/ - convert Dragon/Tandy CoCo CAS file to WAV  Copyright 2013-2021 Ciaran Anscomb
        https://colorcomputerarchive.com/repo/Utilities/cas2wav-batch.zip (Seems to be a copy of cas2wave.exe, no source or author but properly adds silence for imporved loading.)
        https://retrocomputing.stackexchange.com/questions/150/what-format-is-used-for-coco-cassette-tapes

        https://stackoverflow.com/questions/44157522/play-wav-byte-data-on-the-browser-on-a-player
        https://stackoverflow.com/questions/23451726/saving-binary-data-as-file-using-javascript-from-a-browser
        https://hexed.it/ (great online hex editor!)

        Works well depnding on hardware..  Seems to work well on most PCs audio out with sound on very high without distortion.. If it don't work on one, try anouther.  Does not seem to work on my Samsung Phones/Tablets.. Maybe sound is not loud enough?
        Currently no options.. Not sure if needed for other hardware?  Currently only supports 9600 bit rate.
    */
        (async function() {
            const enc = new TextDecoder("utf-8")
            , Audio = document.getElementById("Audio")
            , fileInput = document.getElementById("file-input")
            , btnSaveWav = document.getElementById("btnSaveWav")
            , selZFiles = document.getElementById("selZFiles")
            , FileCS = document.getElementById("FileCS")
            , CasCS = document.getElementById("CasCS")
            , WavCS = document.getElementById("WavCS")
            btnSaveWav.onclick = Download
            fileInput.onchange = readZipFiles //readFile
            selZFiles.ondblclick = selZFilesOnChange
            
            let zentries, cocoCasWave
        
            function countOnesAndZeros(fb) {
            let z = 0, o= 0
            for (let i = 0; i < fb.length; i++) {
                let bits = fb[i].toString(2).padStart(8, '0')
                for (const b of bits) if(b === '1') o++ ; else z ++
            }
            console.log(`z: ${z}, o:${o}`)
            return { o, z }
        }
        
            function writeWavHeader(fl,r, d) {
                d.set(encStr('RIFF'),        0) //Contains the letters "RIFF" in ASCII
                d.set(convert32(fl-8),       4) //This is the size of the entire file in bytes minus 8 bytes
                d.set(encStr('WAVEfmt '),    8) //Format
                d.set(convert32(16),        16) //Subchunk1Size 16 for PCM
                d.set(convert32(1),         20) //AudioFormat PCM = 1
                d.set(convert16(1),         22) //NumChannels MONO = 1
                d.set(convert32(r),         24) //SampleRate  * NumChannels * BitsPerSample/8
                d.set(convert32(r),         28) //ByteRate = SampleRate  * NumChannels * BitsPerSample/8
                d.set(convert16(1),         32) //BlockAlign MONO = 1
                d.set(convert16(8),         34) //BitsPerSample 
                d.set(encStr('data'),       36) //Subchunk2ID
                d.set(convert32(fl-44),     40) //Subchunk2Size
            }
        
            function createAudioZX81(f) {
                const waves = [[0xE3, 0xFB, 0xB7, 0x49, 0x05, 0x1D]] //22050
                f = new Uint8Array(f)
                var fb = new Uint8Array(f.length + 1)
                fb[0] = 0xB5 //insert prefix?
                fb.set(Array.from(f), 1)
                //var fb = new Uint8Array([ 0xB5, ...Array.from(f)]) //slower?

                let oz = countOnesAndZeros(fb)
                fl = oz.z*54 + oz.o*89 + 5000 + 45 // padding for added silence and wav header
                console.log(oz, fl)
                let d = new Uint8Array(fl)
                d.fill(0x80)
                writeWavHeader(fl, 22050, d)
                let o = 44
                for (let x = 0; x <= 5000; x++) d[o++] = 0x80 //silence
                console.log("o:", o)
                
                for (const b of fb) {
                    let bits = b.toString(2).padStart(8, '0').split("").join("")
        
                    for (const b of bits){
                                let c = b === '0' ? 4:9
                                for (let x = 0; x < c; x++) {
                                    d.set(waves[0], o)
                                    o+= waves[0].length
                                    d[o++] = 0x80
                                }
                                for (let x = 0; x < 26; x++) d[o++] = 0x80
                        }
                }
                console.log('end:', o.toString(16), fl.toString(16), fb[0], d[0])
                //console.log("zxd:", d)
                return d
            }
            
            function createAudioCoCo(fb) {
                fb = new Uint8Array(fb)
                const SilenceByte = 0x80, waves = [[ 0xA6, 0xDC, 0xDC, 0xA6, 0x59, 0x23, 0x23, 0x59 ],[ 0xC6, 0xC6, 0x39, 0x39] ] //9600
                , oz = countOnesAndZeros(fb)
                , fl =  oz.z*8 + oz.o*4  + 0x3000 + 44 // padding for added silence and wav header
                let d = new Uint8Array(fl)
                writeWavHeader(fl, 9600, d)
                let o = 44
                
                while(o <= 0x82b) d[o++] = SilenceByte //silence 1
                console.log("end s1:", o.toString(16))
                //nameblock 0x11e
                for (const b of fb.subarray(0, 0x95)) {
                    let bits = b.toString(2).padStart(8, '0').split("").reverse().join("")
                    for (const b of bits){
                            let sw = waves[parseInt(b)]
                                d.set(sw, o)
                                o+= sw.length
                        }
                }
                console.log('end nb:', o.toString(16))
                //o = 0x24b8
        
                while(o <= 0x44b7) d[o++] = SilenceByte //silence 2
                console.log("e s2: 44b9: ", o.toString(16))
                //o = 0x44b9
                
                
                //data 0x94
                for (let i = 0x95; i < fb.length ; i++){
                    let bits = fb[i].toString(2).padStart(8, '0').split("").reverse().join("")
                        for (const b of bits){
                            let sw = waves[parseInt(b)]
                                d.set(sw, o)
                                o+= sw.length
                        }
                }
        
                console.log("e d: ",o.toString(16))
        
                while(o <= d.length) d[o++] = SilenceByte //silence end
                return d
            }
        
            async function readFile(f) {
                const arrayBuffer = await f.arrayBuffer()
                FileCS.innerText = await SHAbuf(arrayBuffer)
       
                if(f.name.toLowerCase().endsWith(".p"))
                    cocoCasWave = createAudioZX81(arrayBuffer)
                else
                    cocoCasWave = createAudioCoCo(arrayBuffer)
                
                Audio.src = URL.createObjectURL(new Blob([cocoCasWave], { type: 'audio/wav' }))
                WavCS.innerText = await SHAbuf(cocoCasWave)
            }
        
            function Download() {
                var saveByteArray = (function () {
                var a = document.createElement("a")
                a.style = 'display: none'
                document.body.appendChild(a)
                return function (data, name) {
                    var blob = new Blob([data], {type: "application/octet-stream"}),
                        url = window.URL.createObjectURL(blob)
                    a.href = url
                    a.download = name
                    a.click()
                    a.remove()
                    window.URL.revokeObjectURL(url)
                }
                }())
                saveByteArray(cocoCasWave, 'test.wav')
            }
        
            function encStr(s){return new TextEncoder("utf-8").encode(s) } 
            function convert16(n) { return  new Uint8Array(new Uint16Array([n]).reverse().buffer) }
            function convert32(n) { return  new Uint8Array(new Uint32Array([n]).reverse().buffer) }
            async function SHAbuf(arrayBuffer, alg=1){
                const hashBuffer = await crypto.subtle.digest(`SHA-${alg}`, arrayBuffer)
                const hashArray = Array.from(new Uint8Array(hashBuffer))
                return hashArray.map(b => b.toString(16).padStart(2, '0')).join('').toUpperCase()
            }
            //for unzipit
            async function readZipFiles() {
                const f = fileInput.files[0]
                const arrayBuffer = await f.arrayBuffer()
                FileCS.innerText =  await SHAbuf(arrayBuffer)
                CasCS.innerText =  ""
                WavCS.innerText =  ""
        
                if(f.name.toLowerCase().endsWith(".zip")){
                    const {entries} = await unzipit.unzip(f)
                    // print all entries and their sizes
                    zentries = entries
                    selZFiles.options.length = 0
                    for (const [name, entry] of Object.entries(zentries)) {
                        //console.log(name, entry.size);
                        var opt = document.createElement('option')
                        opt.value = name
                        opt.innerHTML = `${name} bytes: ${entry.size}`
                        selZFiles.appendChild(opt)
                    }
                } else{
                    selZFiles.options.length = 0
                    await readFile(f)
                }
            }
        
            async function selZFilesOnChange() {
                const arrayBuffer = await zentries[selZFiles.value].arrayBuffer()
                CasCS.innerText = await SHAbuf(arrayBuffer)
                
                if(selZFiles.value.toLowerCase().endsWith(".p"))
                    cocoCasWave = createAudioZX81(arrayBuffer)
                else
                    cocoCasWave = createAudioCoCo(arrayBuffer)
        
                Audio.src = URL.createObjectURL(new Blob([cocoCasWave], { type: 'audio/wav' }))
                WavCS.innerText = await SHAbuf(cocoCasWave)
            }
        
        }())