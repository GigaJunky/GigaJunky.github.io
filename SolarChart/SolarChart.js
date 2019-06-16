
let
                      ctx = document.getElementById('canvas').getContext('2d'),
              tbStartDate = document.getElementById('tbStartDate'),
tbDefaultInstallationGUID = document.getElementById('tbDefaultInstallationGUID'),
           tbCustomerGUID = document.getElementById('tbCustomerGUID'),
                   lblMsg = document.getElementById('lblMsg')
              tbDarkSkyID = document.getElementById('tbDarkSkyID'),
               tbLatitude = document.getElementById('tbLatitude'),
              tbLongitude = document.getElementById('tbLongitude'),
              tbStartDate.value = new Date().toISOString().substr(0, 10)
              , config = {}
          

, configs = document.querySelectorAll('.config').forEach(c => c.addEventListener('change', () => updateConfig()))

LoadConfig()

function isGUID(GUID){ return /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/.test(GUID) }

function updateConfig()
{
    let sParams = location.search // .hash.replace('#','?')
        ,params = new URLSearchParams(sParams)
    console.log('params: ', [...params].length,  sParams)
    console.log('tbCustomerGUID.value: ', tbCustomerGUID.value)

    config.CustomerGUID = tbCustomerGUID.value
    config.DefaultInstallationGUID = tbDefaultInstallationGUID.value
    config.DarkSkyID = tbDarkSkyID.value
    config.Lat = tbLatitude.value
    config.Long = tbLongitude.value
    console.log('updateConfig:', config)

    updateParam(params, 'CustomerID', 'CustomerGUID')
    updateParam(params, 'InstallID', 'DefaultInstallationGUID')
    updateParam(params, 'DarkSkyID')
    updateParam(params, 'Lat')
    updateParam(params, 'Long')

    if(sParams !== params.toString()) location.search = params.toString()
}

function updateParam(params, p, cn)
{
    if(!cn) cn = p
    console.log('cn: ', cn)
    let v = config[cn]
    if(v && v!=='undefined')
        if(!params.has(p)) params.append(p, config[cn]); else params.set(p, config[cn])
    
}

function LoadConfig(bReload = false)
{
    //let lsConfig = localStorage.getItem('config')
    //if(lsConfig) config = JSON.parse(lsConfig)

    let sParams = location.search //.hash.replace('#','?')
    ,params = new URLSearchParams(sParams)
    console.log('params: ', [...params].length,  sParams)
    config.DefaultInstallationGUID = params.get('InstallID')
    config.CustomerGUID = params.get('CustomerID')
    config.DarkSkyID = params.get('DarkSkyID')
    config.Lat = params.get('Lat')
    config.Long = params.get('Long')

    tbDefaultInstallationGUID.value = config.DefaultInstallationGUID
    tbCustomerGUID.value = config.CustomerGUID
    tbDarkSkyID.value = config.DarkSkyID
    tbLatitude.value = config.Lat
    tbLongitude.value = config.Long

    /*
    if(!bReload) bReLoad = isGUID(config.CustomerGUID) && isGUID(config.DefaultInstallationGUID)
    console.log('load config: ', bReload, config)

    if (!bReload ){
        console.log('config: ', config)
        tbCustomerGUID.value = config.CustomerGUID
        tbDefaultInstallationGUID.value = config.DefaultInstallationGUID

        tbDarkSkyID.value = config.DarkSkyID
        tbLatitude.value = config.Lat
        tbLongitude.value = config.Long
        
        if(!params.has('CustomerID')) params.append('CustomerID', config.CustomerGUID)
        if(!params.has('InstallID'))  params.append('InstallID', config.DefaultInstallationGUID)
        if(!params.has('DarkSkyID'))  params.append('DarkSkyID', config.DarkSkyID)
        if(!params.has('Lat')) params.append('Lat', config.Lat)
        if(!params.has('Long')) params.append('Long', config.Long)
        console.log('params: ', ...params)
        //InstallID=AB575606-2AFC-4612-B600-B9A936B1FA8D&DarkSkyID=2201d75803a232b0c55d4133be6c7dda&Lat=41.716&Long=-88.0138

        //if(params.length !=5) location.search = params.toString()

    }else{
        config.DefaultInstallationGUID = tbDefaultInstallationGUID.value.toUpperCase()
        config.CustomerGUID = tbCustomerGUID.value.toUpperCase()
        config.DarkSkyID = tbDarkSkyID.value
        config.Lat = tbLatitude.value
        config.Long = tbLongitude.value
       
        if(isGUID(config.CustomerGUID) && isGUID(config.DefaultInstallationGUID)){
            localStorage.setItem('config', JSON.stringify(config))
            return true
        } else return false
    }
    */
    return true //isGUID(config.CustomerGUID) && isGUID(config.DefaultInstallationGUID)
}


chartData = {
    labels: ['12am', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, '12pm', 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11],
    datasets: [ {
        type: 'bar',
        label: 'Production 1',
        data: [],
        //backgroundColor: 'darkblue',
        backgroundColor:  'hsla(240, 100%, 40%, 0.7)', //'rgba(21, 85, 162, 0.7)',
        //borderColor: 'black',
        borderWidth: 1
    },{ type: 'bar', label: 'Production 2', backgroundColor: 'hsla(240, 100%, 70%, 0.7)'},
    {
        type: 'line',
        label: 'Consumption',
        data: [0],
        borderColor: 'gray',
        backgroundColor: 'rgba(128, 128, 128, 0.4)',
        borderWidth: 1,
        fill: true
    },{
        type: 'line',
        label: 'Temp',
        yAxisID: 'Temp',
        data: [],
        borderColor: 'green',
        //backgroundColor: 'rgba(128, 128, 255, 0.4)',
        borderWidth: 1,
        fill: false
    },{
        type: 'line',
        label: 'UV',
        yAxisID: 'UV',
        data: [],
        borderColor: 'red',
        //backgroundColor: 'rgba(128, 128, 255, 0.4)',
        borderWidth: 1,
        fill: false
    }
    ]
},
    myChart = new Chart(ctx, {
        type: 'bar',
        data: chartData,
        options: {
            title: { display: true, text: 'Solar Production' },
            tooltips: { mode: 'index', intersect: false },
            responsive: true,
            scales: {
                xAxes: [{ stacked: true }],
                yAxes: [
                    { stacked: true },
                    { id: 'Temp', type: 'linear', position: 'right' },
                    { id: 'UV', type: 'linear', position: 'right', ticks: { max: 10, min: 0 } }
                ]
            }
        }
    })

function DateAdd(days) {
    let d = new Date(tbStartDate.value)
    d.setDate(d.getDate() + days)
    tbStartDate.value = d.toISOString().substr(0, 10)
    teslaCmd()
}

function createCmdUrl(type, sStartDate, sEndDate) {
    return `https://mysolarcity.com/solarcity-api/powerguide/v1.0/${type}/${config.DefaultInstallationGUID}?ID=${config.CustomerGUID}&IsByDevice=true&Period=Hour&StartTime=${sEndDate}T00:00:00&EndTime=${sStartDate}T23:59:59`
}
function createDSdUrl(sDate) {
    let utime = Math.round((new Date(sDate).getTime()) / 1000),
    urlprefix = 'https://cors-anywhere.herokuapp.com/'
    return `${urlprefix}https://api.darksky.net/forecast/${config.DarkSkyID}/${config.Lat},${config.Long},${utime}`
}


function teslaCmd() {
    if(!LoadConfig()){
        alert('Please Enter Customer and Installation ID')
        return false
    }
    let mc, cache, sStartDate = tbStartDate.value, sEndDate = sStartDate
    , ls = localStorage.getItem(sStartDate)
    cache = document.getElementById('cbCache').checked && ls !== null

    if(cache){
        mc = JSON.parse(ls)
        cache = valData(mc)
    }
    //console.log('cache, ls: ', cache, ls)

    if (cache) LoadChart(mc)
    else{
        let type = 'measurements',
            cmd = createCmdUrl(type, sStartDate, sEndDate)
        ajax(cmd, (m) => {
            console.log('m: ', cmd, type, m)
            lblMsg.innerText = m.Message ? m.Message : ''

            type = 'consumption'
            cmd = createCmdUrl(type, sStartDate, sEndDate)
            ajax(cmd, (c) => {
                console.log('Tesla Command: ', cmd, type, c)
                lblMsg.innerText = m.Message ? m.Message : ''
                getWeather(sStartDate, w => {
                    console.log('w: ', w)
                    let mc = reduceData({ m, c, w })
                    localStorage.setItem(sStartDate, JSON.stringify(mc))
                    LoadChart(mc)
                })

            })
        })
    }
}

function getWeather(sStartDate, cb)
{
    if(config.DarkSkyID === null) cb(null)
    ajax(createDSdUrl(sStartDate), w => {
        console.log('w: ', w)
        cb(w)
    })
}

function ajax(cmd, cb) {
    var xhr = new XMLHttpRequest()
    xhr.onreadystatechange = function () {
        if (this.readyState == 4) // && this.status == 200)
            if (cb) cb(JSON.parse(this.responseText))
    }
    xhr.open("GET", cmd, true)
    xhr.send()
}

function Sum(nums) { return nums.reduce((total, sum) => total + sum) }

function reduceData(data) {
    var day = data.m.Devices[0].Measurements[0].Timestamp.substr(0, 10)
        , c = data.c.Consumption.map(o => o.ConsumptionInIntervalkWh)
        , e = [], temp = [], uv = []

    if (data.w) {
         temp = data.w.hourly.data.map(o => o.temperature)
         uv = data.w.hourly.data.map(o => o.uvIndex)
    }
        
    //for (let i=0;i<data.m.Devices.length; i++) e[i] = data.m.Devices[i].Measurements.map(o => o.EnergyInIntervalkWh) // not allways 24
    data.m.Devices.forEach((d,i) => e[i] = Measureto24Hours(d.Measurements))
    return { day, e: e, c, temp, uv, retrieved: new Date().toISOString() }
}

function valData(mc){
    return mc.c && mc.c.length >= 24 && mc.e && Array.isArray(mc.e)
 }

 function SumArray(a) {
     let r = []
    for(let i = 0; i<a[0].length; i++)
        r[i] = a[0][i] + a[1][i]
    return r
 }

 function Measureto24Hours(a) {
    let m = []
    for (let h=0;h<24; h++){
        let o = a.filter( o => new Date(o.Timestamp).getHours() === h)
        m[h] = o[0] ? o[0].EnergyInIntervalkWh : 0
    }
    return m
}


function LoadChart(data) {
    console.log('lc: ', data)
    let s = SumArray(data.e)
    lblMsg.innerText = 'Production: ' + (Sum(s)).toFixed(2) + '  Consumption: ' + Sum(data.c).toFixed(2)
    chartData.datasets[1].data = [];

    if(document.getElementById('cbCombine').checked)
        chartData.datasets[0].data = s //data.e[0];
    else
        data.e.forEach((e,i) =>{
         console.log('e fe: ', e, i)
         chartData.datasets[i].data = e
        })

    chartData.datasets[2].data = data.c;
    chartData.datasets[3].data = data.temp;
    chartData.datasets[4].data = data.uv;
    myChart.options.title.text = 'Solar Production ' + data.day
    myChart.update()
}

function loadFile() {
    if (typeof window.FileReader !== 'function') {
        alert("The file API isn't supported on this browser yet.")
        return
    }
    var input = document.getElementById('fileinput')
    if (!input) alert("Um, couldn't find the fileinput element.")
    else if (!input.files) alert("This browser doesn't seem to support the `files` property of file inputs.")
    else if (!input.files[0]) alert("Please select a file before clicking 'Load'")
    else {
        var file = input.files[0]
        var fr = new FileReader()
        fr.onload = receivedText
        fr.readAsText(file)
    }
}

function receivedText(e) {
    var data = JSON.parse(e.target.result)
    LoadChart(data)
}

function downloadToday()
{
    let mc = localStorage.getItem(tbStartDate.value)
    console.log(tbStartDate.value, mc)
    download(mc, 'solar' + tbStartDate.value +  ' .json', 'text/json')
}

function download(content, fileName, contentType) {
    var a = document.createElement("a");
    var file = new Blob([content], {
        type: contentType
    })
    a.href = URL.createObjectURL(file)
    a.download = fileName
    a.click()
}
//download(JSON.stringify(chartData), 'json.txt', 'text/plain');