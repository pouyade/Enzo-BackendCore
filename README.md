# Enzo Backend Core

Enzo Backend Core is a robust backend system designed to manage applications efficiently. It provides a wide range of features, including user management, notifications, analytics, payment services, and more. This project is built using modern technologies and is containerized for easy deployment.

## Features

- **User Management**: 
  - OAuth-based registration and login system.
  - Email verification, password reset, and Google login support.
  - User blocking and management.

- **Notifications**:
  - Firebase-based notification service for sending messages to users or topics.

- **Support System**:
  - A system to handle user support tickets and queries.

- **Crash and Bug Logging**:
  - Comprehensive logging system to track crashes and bugs.

- **Payment and Planning**:
  - Payment services with plan management.
  - Voucher system for discounts.

- **App Settings**:
  - Remote configuration for apps and platforms.

- **App Update and Maintenance**:
  - Manage app updates and maintenance schedules.

- **Analytics**:
  - Analytics service to monitor system health and usage.

- **Text Management**:
  - Manage and update app texts and messages dynamically.

## Tech Stack

- **Node.js** and **Express**: Backend framework.
- **MongoDB**: Database for storing application data.
- **Redis**: In-memory data store for caching and session management.
- **Firebase**: For notifications and messaging.

## Deployment

- **Docker**: Fully containerized setup for easy deployment.
- **Nginx**: Configured as a reverse proxy for secure and efficient routing.

## Frontend

This repository also includes the frontend for managing the backend system. You can find it [here](https://github.com/pouyade/Enzo-AdminPanel/).

## Configuration

- **Environment Variables**: Configure the application using `.env` files. Refer to `.env.sample` for required variables.
- **Nginx**: Pre-configured for proxying requests to the backend.

## Getting Started

1. Clone the repository:
   ```bash
   git clone https://github.com/pouyade/Enzo-BackendCore.git
   cd Enzo-BackendCore