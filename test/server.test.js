// const request = require('supertest');
// const server = require('../server');

// describe('Server', () => {
//   it('should start the server successfully', async () => {
//     // Make a request to the route that triggers server startup
//     const response = await request(server).get('/trigger-startup');

//     // Assert that the server responded successfully
//     expect(response.status).toBe(200);

//     // Assert that the server log contains the expected message
//     // You might need to adjust this assertion based on your actual logging mechanism
//     expect(console.log).toHaveBeenCalledWith('server started');
//   });
// });


const request = require('supertest');
const { app, startServer } = require('../server');

describe('Server', () => {
  before(async () => {
    await startServer;  // Wait for the server to start
    console.log('Server started');
  });

  after(async () => {
    await app.close();  // Close the server
    console.log('Server closed');
  });

  it('should start the server successfully', async () => {
    // Make a request to the route that triggers server startup
    const response = await request(app).get('/trigger-startup');

    // Assert that the server responded successfully
    expect(response.status).toBe(200);

    // Assert that the server log contains the expected message
    // You might need to adjust this assertion based on your actual logging mechanism
    expect(console.log).toHaveBeenCalledWith('server started');
  });
});
