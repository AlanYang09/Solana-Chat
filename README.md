
# Solana Chat Application

A decentralized chat application built on the Solana blockchain. This application allows users to send messages, create group chats, and manage group memberships in a decentralized manner.

## Features

- Send and receive messages on the Solana blockchain
- Create and manage group conversations
- End-to-end encryption for private messages
- Real-time updates via WebSocket
- Wallet-based authentication

## Prerequisites

- Node.js (v14 or later)
- NPM or Yarn
- A Solana wallet (Phantom, Solflare, etc.)

## Installation

1. Clone the repository:
```
git clone https://github.com/yourusername/solana-chat-app.git
cd solana-chat-app
```

2. Install dependencies:
```
npm install
```

3. Configure environment variables:
```
cp .env.example .env
```
Edit the `.env` file to match your configuration.

4. Start the development server:
```
npm start
```

## Deployment

### Vercel

1. Push your code to a GitHub repository

2. Connect your repository to Vercel

3. Configure the environment variables in the Vercel project settings

4. Deploy

### Netlify

1. Push your code to a GitHub repository

2. Connect your repository to Netlify

3. Configure the environment variables in the Netlify project settings

4. Deploy

### AWS Amplify

1. Push your code to a GitHub repository

2. Connect your repository to AWS Amplify

3. Configure the environment variables in the Amplify project settings

4. Deploy

## WebSocket Server

For real-time updates, you'll need a WebSocket server that subscribes to Solana program account changes. You can:

1. Deploy a simple server using Node.js and `@solana/web3.js`

2. Use a service like [Alchemy](https://www.alchemy.com/) or [QuickNode](https://www.quicknode.com/) that provides WebSocket endpoints

3. Disable WebSockets and rely on polling by setting `REACT_APP_ENABLE_WEBSOCKET=false`

## License

[MIT](LICENSE)

# Getting Started with Create React App

This project was bootstrapped with [Create React App](https://github.com/facebook/create-react-app).

## Available Scripts

In the project directory, you can run:

### `npm start`

Runs the app in the development mode.\
Open [http://localhost:3000](http://localhost:3000) to view it in the browser.

The page will reload if you make edits.\
You will also see any lint errors in the console.

### `npm test`

Launches the test runner in the interactive watch mode.\
See the section about [running tests](https://facebook.github.io/create-react-app/docs/running-tests) for more information.

### `npm run build`

Builds the app for production to the `build` folder.\
It correctly bundles React in production mode and optimizes the build for the best performance.

The build is minified and the filenames include the hashes.\
Your app is ready to be deployed!

See the section about [deployment](https://facebook.github.io/create-react-app/docs/deployment) for more information.

### `npm run eject`

**Note: this is a one-way operation. Once you `eject`, you can’t go back!**

If you aren’t satisfied with the build tool and configuration choices, you can `eject` at any time. This command will remove the single build dependency from your project.

Instead, it will copy all the configuration files and the transitive dependencies (webpack, Babel, ESLint, etc) right into your project so you have full control over them. All of the commands except `eject` will still work, but they will point to the copied scripts so you can tweak them. At this point you’re on your own.

You don’t have to ever use `eject`. The curated feature set is suitable for small and middle deployments, and you shouldn’t feel obligated to use this feature. However we understand that this tool wouldn’t be useful if you couldn’t customize it when you are ready for it.

## Learn More

You can learn more in the [Create React App documentation](https://facebook.github.io/create-react-app/docs/getting-started).

To learn React, check out the [React documentation](https://reactjs.org/).
