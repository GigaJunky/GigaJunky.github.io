 const cfg = {
      ccc: { address: {LJS: 8000, RJS: 8016 } }

      , joysticks : [
           { name: 'No Change'}
         , { name: 'Reset',             esp32: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,0]}
         , { name: 'Rii SNES Pads ES',  esp32: [9,3,4,0,0,0,0,0,0,0,0,5,32,5,64], usbid : "USB Gamepad (Vendor: 0810 Product: 0001). Buttons: 12 Axes: 6"}
         , { name: 'Rii SNES Pads SE',  esp32: [9,3,4,0,0,0,0,0,0,0,0,5,64,5,32]}
         , { name: 'Rii SNES Pads NW',  esp32: [9,3,4,0,0,0,0,0,0,0,0,5,16,5,128]}
         , { name: 'Rii SNES Pads WE',  esp32: [9,3,4,0,0,0,0,0,0,0,0,5,128,5,64]}
         , { name: 'CBs SNES Pads',     esp32: [9,3,4,0,0,0,0,0,0,0,0,5,128,5,64], note: "Good copy of Cedrick config that fix my Rii SNES pads"}
         , { name: 'MHs Bad SNES Pads', esp32: [9,2,3,0,0,0,0,0,0,0,0,5, 32,5,64], note: "Bad saving of Mike Horgan's Rii SNES pads. X don't work.. Should save 9,3,4 vs 9,2,3"}
         , { name: 'AliExpress PS2 Analog ES',  esp32: [9,3,4,0,0,0,0,0,0,0,0,5,16,5,128,5], url: "https://www.aliexpress.com/item/1005004894416448.html"}
         , { name: 'AliExpress PS2 Analog NW',  esp32: [99,2,3,0,0,0,0,0,0,0,0,5,32,5,64,0]}

         , { name: 'Add Yours Here',    esp32: [9,3,4,0,0,0,0,0,0,0,0,5,128,5,64]}
      ]
    }