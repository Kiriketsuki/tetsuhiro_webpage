const { defineConfig } = require('@vue/cli-service')
module.exports = {
    configureWebpack: {
        devServer: {
            proxy: {
                '/api': {
                    target: 'http://localhost:3000',
                }
            }
        }
    }
}