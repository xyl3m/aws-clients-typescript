# AWS Clients TypeScript

This repository contains a Node.js utility using TypeScript to interact with various AWS SDK clients. The utility is designed to help developers easily import and use AWS SDK clients in their TypeScript or JavaScript projects.

## Table of Contents

- [Prerequisites](#prerequisites)
- [Installation](#installation)
- [Available AWS Clients](#available-aws-clients)
- [Contributing](#contributing)
- [License](#license)

## Prerequisites

Before you begin, ensure you have met the following requirements:

- You have installed the latest version of [Node.js](https://nodejs.org/) and [npm](https://www.npmjs.com/).
- You have an AWS account with the necessary permissions and configured [AWS CLI](https://aws.amazon.com/cli/) with your credentials.

## Installation

To use this utility in your project, follow these steps:

1. Add the utility as a dependency to your project:

```bash
npm install git+https://github.com/xyl3m/aws-clients-typescript.git
```

2. Import the utility in your project:

```typescript
import { S3Client } from "aws-clients-typescript/src/clients/s3Client";
```

## Available AWS Clients
This utility provides the following AWS SDK clients:
- [x] SQS
- [x] S3
- [ ] Kinesis Stream
- [ ] SES

... and more to come!

Each client is available in the `src/clients` directory.

## Contributing
If you want to contribute to this project, follow these steps:

1. Fork the repository on GitHub.
2. Create a new branch with your changes.
3. Submit a pull request with a detailed description of your changes.

## License
This project is licensed under the [MIT License](https://mit-license.org/)
