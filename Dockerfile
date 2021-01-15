FROM node:14-alpine AS build
WORKDIR /app
COPY . .
RUN yarn install
RUN yarn build

FROM node:14-alpine
WORKDIR /app
COPY --from=build ./app/dist ./dist
COPY package* ./
RUN yarn install --production
ENV PORT=80
CMD yarn start