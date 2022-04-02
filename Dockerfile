FROM beevelop/nodejs-python
LABEL MAINTAINER https://github.com/A0nameless0man/download-webhook

WORKDIR /app

COPY . /app

RUN yarn;

EXPOSE 3000
CMD ["npm", "run", "start"]