    /* Tesla LightShow Player v0.1 beta
    bitjunky@hotmail.com 2021-12-30
    */
    let frameInterval, h = new FSeq() //fseq header
    , keys = {}
    , AudioDuration = 0
    , TrackFrame = 0
    , TrackPaused = true

    h.create(40, [
        { c: 'mf', d: '/Users/anthony/Downloads/Star Wars The Imperial March Darth Vaders Theme.mp3'},
        { c: 'sp', d: 'Tesla Light Show Player 2022.01'},
        { c: 'an', d: 'BitJunky'},
        { c: 'ae', d: 'BitJunky@hotmail.com '},
    ] )
    console.log('create:', h)

    const Audio = document.getElementById("Audio")
    , display = document.getElementById("display")
    , channels = document.getElementsByClassName('channel')
    , MemoryUsed = document.getElementById('MemoryUsed')
    , TMSChNames = "Left Outer Main Beam,Right Outer Main Beam,Left Inner Main Beam,Right Inner Main Beam,Left Signature,Right Signature,Left Channel 4,Right Channel 4,Left Channel 5,Right Channel 5,Left Channel 6,Right Channel 6,Left Front Turn,Right Front Turn,Left Front Fog,Right Front Fog,Left Aux Park,Right Aux Park,Left Side Marker,Right Side Marker,Left Side Repeater,Right Side Repeater,Left Rear Turn,Right Rear Turn,Brake Lights,Left Tail,Right Tail,Reverse Lights,Rear Fog Lights,License Plate,Left Falcon Door,Right Falcon Door,Left Front Door,Right Front Door,Left Mirror,Right Mirror,Left Front Window,Left Rear Window,Right Front Window,Right Rear Window,Liftgate,Left Front Door Handle,Left Rear Door Handle,Right Front Door Handle,Right Rear Door Handle,Charge Port,NA1,NA2".split(',')
    , keyMap = '1234567890qwertyuiop[]asdfghjkl;zxcvbnm.'

    document.addEventListener('keydown', (e) => {
        console.log('kd: ',e.code, e.key, keys)
        keys[e.key] = true
    })
    document.addEventListener('keyup', (e) => { 
        keys[e.key] = false
    })

    Audio.onloadedmetadata = ()=>{
        console.log('Audio duration: ', Audio.duration)
        AudioDuration = AudioDuration.duration
    }
    Audio.onplaying = () => {
        TrackPaused = false
        console.log('Audio Playing', Audio.currentTime)
    }
    Audio.onpause = () => {
        TrackPaused = true
        console.log('Audio Paused', Audio.currentTime)
    }
    Audio.onseeked = () => {
        TrackFrame = parseInt(Audio.currentTime * 50)
        console.log('Audio seeked to: ', Audio.currentTime, TrackFrame )
    }


    for (let i = 0; i < TMSChNames.length; i++) {
        let cn = TMSChNames[i]
    //for (const cn of TMSChNames) {
        let c = document.getElementsByClassName(cn.replace(/ /g,''))
        if(c.length == 0) console.log(`${cn} not found!`)
        for (const e of c) e.innerHTML = `${cn}:${i} ${keyMap[i]}`
    }

    function readFile()
    {
        const files = findLSFiles(event.target.files)
        if(!files){
            alert('Please select both lightshow.sfeq and lightshow.mp3|wav files by (Ctrl-A or Shift Select)!')
            return
        }
        console.log('files: ', files)
        Audio.src = window.URL.createObjectURL(files.audio)
        let reader = new FileReader()
        reader.readAsArrayBuffer(files.fseq)
        reader.onload = () => {
            h.readHeader(new Uint8Array(reader.result))
            MemBar()
            console.log('LastNonZero(),', h.LastNonZero(), h.data.length )

            onPlay()
        }
    }

    function MemBar()
    {
        const MemPercent = (h.MemoryUsed.Total / h.MemoryUsed.MEMORY_LIMIT * 100).toFixed(2)
        MemoryUsed.style.width = `${MemPercent}%`
        MemoryUsed.title = `${MemPercent}%`
        MemoryUsed.innerText = `${MemPercent}% = ${h.MemoryUsed.Total}/${h.MemoryUsed.MEMORY_LIMIT}`
    }

    function findLSFiles(filelist)
    {
        if(filelist.length < 2) return;
        let files = {}
        for (const f of filelist)
            if(!files.fseq && /\.fseq$/i.test(f.name)) files.fseq = f
            else if(!files.audio && /\.(mp3|wav)$/i.test(f.name)) files.audio = f

        return files
    }

    function onPlay() {
        if(!h) return

        if(frameInterval){
            frameInterval = clearInterval(frameInterval)
            Audio.pause()
            Audio.currentTime = 0
            return
        }
        Audio.play()
        console.log('Audio duration:', Audio.duration, parseInt(Audio.duration * h.StepTime / 1000))

        let f = parseInt(Audio.currentTime * 50)
        frameInterval = setInterval(function() {

            let os = f * h.ChannelCount + h.ChannelDataOffset
            if (f < (h.FrameCount)) {
                let frame = h.data.subarray(os ,os + h.ChannelCount)
                display.innerHTML = `Frame#: ${f} Secs: ${f * (20/1000)} Values: + ${frame.toString()}`
                toggleChannels(frame)

            } else clearInterval(frameInterval)
            f++

        }, 20)
    }

    function toggleChannels(chs) {
        for (let i = 0; i < chs.length; i++){
            let cn = TMSChNames[i].replace(/ /g,'')
            let c = document.getElementsByClassName(cn)
            if(keys[keyMap[i]]) chs[i] = 255

            for (const e of c){
                e.classList.toggle("ChOn" , chs[i] !=0 )
                e.classList.toggle("ChOff", chs[i] ==0 )
            }
        }
    }

    function valTesla(h)
    {
        let e = []
        if (h.Identifier != 'PSEQ' || h.ChannelDataOffset < 24 || h.FrameCount < 1 || h.StepTime < 15 || h.MinorVersion != 0 || h.MajorVersion != 2)
            e.push("Unknown file format, expected FSEQ v2.0")
        if (h.ChannelCount != 48)
            e.push(`Expected 48 channels, got ${h.ChannelCount}`)
        if (h.Compression != 0)
            e.push("Expected file format to be V2 Uncompressed")
        if (h.duration_s > 5*60)
            e.push(`Expected total duration to be less than 5 minutes or 300 seconds, got ${h.duration_s}}`)
        return e
    }

    function Download()
    {
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
        saveByteArray(h.data, 'my.fseq')
    }
