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
  const aulaClient = new AulaClient(settings.AULA_USERNAME, settings.AULA_PASSWORD, '.cookies.json')
  await aulaClient.updateData()
  console.log(aulaClient)
}
start()
