const http = require('http')
const spawn = require('child_process').spawn
const createHandler = require('github-webhook-handler')
const express = require('express')

const app = express()
const handler = createHandler({
  path: '/webhook',
  secret: '87grDaVNiaMrd47d8ADlNdBBeQbtlcEmSdc9ql3igSQ5DC1jgweyfQPaZTrjzqPj'
})

app.post('/webhook', (req, res) => {
  handler(req, res, (err) => {
    res.statusCode = 404
    res.end('no such location')
  })
})

handler.on('error', (err) => {
  console.error('Error:', err.message)
})

handler.on('push', (event) => {
  console.log('Received push event for %s to %s',
    event.payload.repository.name,
    event.payload.ref)

  if (event.payload.ref === 'refs/heads/main') {
    console.log('Deploying main branch...')
    
    // Выполняем скрипт деплоя
    const deploy = spawn('/bin/bash', ['pull.prod'], {
      cwd: '/home/ssk/webhook-server'
    })
    
    deploy.stdout.on('data', (data) => {
      console.log(`stdout: ${data}`)
    })
    
    deploy.stderr.on('data', (data) => {
      console.error(`stderr: ${data}`)
    })
    
    deploy.on('close', (code) => {
      console.log(`Deploy process exited with code ${code}`)
    })
  }
})

app.listen(9000, () => {
  console.log('Webhook server listening on port 9000')
})
