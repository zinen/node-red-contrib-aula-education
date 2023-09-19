'use strict'
// const Path = require('path')
const fs = require('node:fs/promises')
const AulaClient = require('../aula-client.js')

// const settings = {}

async function dotEnvMini () {
  let data = await fs.readFile('.env', { encoding: 'utf8' })
  data = data.split(/\r?\n/)
  for (const line of data) {
    if (line.trim()[0] === '#') continue
    const [key, value] = line.split('=')
    if (value === undefined) continue
    process.env[key.trim()] = value.trim()
  }
}

async function start (params) {
  await dotEnvMini()
  const aulaClient = new AulaClient({
    username: process.env.AULA_USERNAME,
    password: process.env.AULA_PASSWORD,
    cookieStore: '.cookies.json'
  })
  // console.log(await aulaClient.getMessages())
  console.log(await aulaClient.getNotifications())
  // console.log(aulaClient)
  // console.log(await aulaClient.getPosts('2023-09-01'))
  // console.log(await aulaClient.getCalender())
  // await aulaClient.clearSession()
  // console.log(await aulaClient.getPosts('2023-09-01'))
  // console.log(await aulaClient.getAlbums())
}
start()
