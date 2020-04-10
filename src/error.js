export class OpenStackError extends Error {
  constructor(message, error) {
    super(message);
    this.stack = new Error().stack;
    if (error) {
      if (error instanceof OpenStackError) {
        this.code = error.code;
        this.data = error.data;
      }
      // for axios error
      if (error.response) {
        this.code = error.response.status;
        this.data = error.response.data;
      }
    }
  }
}
