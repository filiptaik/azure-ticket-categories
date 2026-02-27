/* eslint-disable @typescript-eslint/no-var-requires */
const path = require('path');
const webpack = require('webpack');
const LodashModuleReplacementPlugin = require('lodash-webpack-plugin');
const MonacoWebpackPlugin = require('monaco-editor-webpack-plugin');
const HtmlWebpackPlugin = require('html-webpack-plugin');

console.log('Using webpack.js configuration');

const observerConfig = {
  entry: './src/observer/index.ts',
  mode: 'production',
  output: {
    filename: 'observer.js',
    path: path.resolve(__dirname, 'dist'),
  },

  resolve: {
    extensions: ['.json', '.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new webpack.optimize.ModuleConcatenationPlugin(),
    new LodashModuleReplacementPlugin(),
    new HtmlWebpackPlugin({
      filename: 'observer.html',
    }),
  ],
};

const confighubConfig = {
  entry: './src/confighub/index.tsx',
  mode: 'development',
  output: {
    filename: 'confighub.js',
    path: path.resolve(__dirname, 'dist'),
  },
  resolve: {
    extensions: ['.json', '.ts', '.tsx', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
      {
        test: /\.css$/,
        use: ['style-loader', 'css-loader'],
      },
      {
        test: /\.(png|woff|woff2|eot|ttf|svg)$/,
        loader: 'file-loader',
      },
    ],
  },
  plugins: [
    new webpack.optimize.ModuleConcatenationPlugin(),
    new LodashModuleReplacementPlugin(),
    new MonacoWebpackPlugin({ languages: ['json'] }),
    new HtmlWebpackPlugin({
      template: 'static/confighub.html',
      filename: 'confighub.html',
    }),
  ],
};

module.exports = [observerConfig, confighubConfig];
