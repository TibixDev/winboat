* reset app version which is v0.9.0
* changing memory allocaton doesn't actually do anything though the UI works
* refactor migration strategy - only navigate to /migration if performAutoMigrations() indicates there's work to do
* add a GitHub Actions workflow file to `.github/workflows/test.yml` that runs both frontend and backend tests on push. 
