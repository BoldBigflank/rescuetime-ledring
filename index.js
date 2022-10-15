import * as dotenv from 'dotenv'
dotenv.config()

import chalk from 'chalk'
import fetch from 'cross-fetch'

const DEBUG = process.env.DEBUG
const PARTICLE_ACCESS_TOKEN = process.env.PARTICLE_ACCESS_TOKEN
const RT_KEY = process.env.RT_KEY

// 24 lights, 6 hex per = 144 characters

const main = async () => {
    // Get data from RescueTime
    const productivity = await getRTFeed()
    // Form a string of lights
    const colorString = getColorString(productivity.rows)
    // Send it to Particle
    await updateColors(colorString)
}

const getRTFeed = async () => {
    // To request information about the user's productivity levels, by hour, for the date of January 1, 2020:
    // https://www.rescuetime.com/anapi/data
    //   ?key=YOUR_API_KEY
    //   &perspective=interval
    //   &restrict_kind=productivity
    //   &interval=hour
    //   &restrict_begin=2020-01-01
    //   &restrict_end=2020-01-01
    //   &format=json
    const day = 1000 * 60 * 60 * 24 // milliseconds in a day
    const today = new Date()
    const yesterday = new Date(today - day)
    const tomorrow = new Date(today + day)
    
    const rtQuery = {
        key: RT_KEY,
        perspective: 'interval',
        resolution_time: 'minute',
        restrict_begin: `${yesterday.getUTCFullYear()}-${yesterday.getMonth() + 1}-${yesterday.getDate()}`,
        restrict_end: `${tomorrow.getUTCFullYear()}-${tomorrow.getMonth() + 1}-${tomorrow.getDate()}`,
        restrict_kind: 'productivity',
        format: 'json'
    }
    const qs = new URLSearchParams(rtQuery)
    const rtUrl = `https://www.rescuetime.com/anapi/data?${qs.toString()}`
    
    const response = await fetch(rtUrl)
    const json = await response.json()
    return json
}

const getColorString = (productivity) => {
    const now = new Date(productivity[productivity.length - 1][0])
    const colors = new Array(24 * 3).fill(0x00) // 24 LEDs, 3 channels each
    for (let i = 0; i < productivity.length; i++) {
        const [date, seconds, num, prodScore] = productivity[i]
        const d = new Date(date)
        // If it's over 1 hour old, break
        if (d <= new Date(now - 1000 * 60 * 55)) continue
        const slot = Math.floor(d.getMinutes() / 5) * 2 * 3
        const percent = seconds / 300
        if (seconds > 0) {
            if (prodScore < 0) {
                // Increase red
                colors[slot] += Math.floor(0xff * percent)
                colors[slot + 3] += Math.floor(0xff * percent)
            } else if (prodScore > 0) {
                // Increase blue
                colors[slot + 2] += Math.floor(0xff * percent)
                colors[slot + 5] += Math.floor(0xff * percent)
            } else {
                // increase green
                colors[slot + 1] += Math.floor(0xff * percent)
                colors[slot + 4] += Math.floor(0xff * percent)
            }
        }
    }
    return colors.map((c, i) => {
        return c.toString(16).padStart(2, '0')
    }).join('')
}

const updateColors = async (colorString) => {
    if (DEBUG) {
        // Show a log of it
        let lightString = ''
        for (let i = 0; i < colorString.length; i = i + 6) {
            const colorUnit = `#${colorString.substring(i, i + 6)}`
            const unitColor = chalk.hex(colorUnit)
            lightString += unitColor('⬤ ')
        }
        console.log(lightString)
    }
    const particleUrl = 'https://api.particle.io/v1/devices/3b003b000747343232363230/colors'
    const response = await fetch(particleUrl, {
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${PARTICLE_ACCESS_TOKEN}`,
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({
            arg: colorString
        })
    })
    const json = await response.json()
    if (DEBUG) console.log(json)
}

main()