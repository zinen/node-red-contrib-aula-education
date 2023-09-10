'use strict'
// const Path = require('path')
const fs = require('node:fs/promises')
const AulaClient = require('../aula-client.js')

const settings = {

}

async function dotEnvMini (inputObject) {
  let data = await fs.readFile('.env', { encoding: 'utf8' })
  data = data.split(/\r?\n/)
  for (const line of data) {
    const [key, value] = line.split('=')
    inputObject[key] = value
  }
}

async function start (params) {
  await dotEnvMini(settings)
  const aulaClient = new AulaClient({
    username: settings.AULA_USERNAME,
    password: settings.AULA_PASSWORD,
    cookieStore: '.cookies.json'
    // updateCalendar: true
  })

  // console.log(await aulaClient.getMessages())
  // console.log(await aulaClient.getNotifications())
  // console.log(aulaClient)
  // console.log(await aulaClient.getPosts('2023-09-01'))
  console.log(await aulaClient.getCalender())
  await aulaClient.clearSession()
  console.log(await aulaClient.getPosts('2023-09-01'))
}
start()
