(function(root, factory) {
  if (typeof module === 'object' && typeof module.exports === 'object') {
    module.exports = factory(require('jquery'));
  } else {
    root.wdcwConfig = factory(root.jQuery);
  }
} (this, function ($) {
  var wdcwConfig = {tables: {}};

  wdcwConfig.name = 'Formstack';
  wdcwConfig.authType = 'custom';

  var getNewAccessToken,
      buildApiFrom;

  /**
   * Run during initialization of the web data connector.
   *
   * @param {string} phase
   *   The initialization phase. This can be one of:
   *   - tableau.phaseEnum.interactivePhase: Indicates when the connector is
   *     being initialized with a user interface suitable for an end-user to
   *     enter connection configuration details.
   *   - tableau.phaseEnum.gatherDataPhase: Indicates when the connector is
   *     being initialized in the background for the sole purpose of collecting
   *     data.
   *   - tableau.phaseEnum.authPhase: Indicates when the connector is being
   *     accessed in a stripped down context for the sole purpose of refreshing
   *     an OAuth authentication token.
   *
   * @return Promise
   *   This method should return a Promise. When all set up tasks for the given
   *   phase are complete, the promise should be resolved. If your setup tasks
   *   are completely synchronous, you can simply return Promise.resolve();
   *
   * @note If you don't need to run anything during the setup phase, you can
   * completely remove this block of code.
   *
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#registerSetup
   */
  wdcwConfig.setup = function setup(phase) {
    var connector = this;

    return new Promise(function setupPromise(resolve) {
      switch (phase) {
        case 'interactive':
          // Perform set up tasks that relate to when the user will be prompted to
          // enter information interactively.

          // Once done, be sure to signal that initialization is done.
          resolve();
          break;

        // Here, we just need to make sure we have a good OAuth access token.
        case 'auth':
          // If we have a token, ensure it's still valid. Request a new token if
          // it is no longer or will soon be invalid.
          if (connector.getPassword()) {
            $.ajax({
              url: 'http://api.example.com/some/predictable/endpoint',
              headers: {
                Accept: 'application/json',
                // This may be one of several ways to attempt to validate a token.
                Authorization: 'token ' + connector.getPassword()
              },
              success: function(response) {
                // For some authentication flows, the request may succeed, but you
                // need to check its contents to determine token validity. That
                // logic should go here. If your condition fails, be sure to
                // attempt to retrieve a new access token.
                if (response.someConstraintPasses) {
                  resolve();
                }
                else {
                  getNewAccessToken();
                  resolve();
                }

                // Consult your API documentation for authentication flow details
                // specific to the API.
              },
              // If there was an error making the request, we likely need to get a
              // new access token.
              error: function() {
                getNewAccessToken();
                resolve();
              }
            });
          }
          // If we don't yet have a token, direct the user to get a token.
          else {
            getNewAccessToken();
            resolve();
          }
          break;

        default:
          resolve();
      }
    });
  };

  /**
   * Run when the web data connector is being unloaded. Useful if you need
   * custom logic to clean up resources or perform other shutdown tasks.
   *
   * @return Promise
   *   This method should return a Promise. When all teardown tasks are complete,
   *   the promise should be resolved. If your teardown tasks are completely
   *   synchronous, you can simply return Promise.resolve().
   *
   * @note If you don't need to run anything during the teardown phase, you can
   * completely remove this block of code.
   *
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#registerTeardown
   */
  wdcwConfig.teardown = function teardown() {
    // Once shutdown tasks are complete, return a resolved Promise. Particularly
    // useful if your clean-up tasks are asynchronous in nature.
    return Promise.resolve();
  };

  /**
   * Primary method called when Tableau is asking for the schema that this web
   * data connector provides.
   *
   * @return Promise.<Array.TableInfo>
   *   Should return a promise to an array of native Tableau TableInfo objects.
   *   If your WDC only has one table, then it should be an array of length 1.
   *   If your WDC supports multiple tables, then you may return as many Table
   *   Info objects as you need. Get complete details on what a TableInfo object
   *   looks like in the Tableau WDC API docs.
   *
   * @see https://tableau.github.io/webdataconnector/ref/api_ref.html#webdataconnectorapi.tableinfo-1
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#registerSchema
   */
  wdcwConfig.schema = function schema() {
    // Potentially, your connector has a fixed set of tables with pre-specified
    // schemas that you could return like this:
    return Promise.all([
      $.when($.getJSON('./src/schema/tableId.json'))
    ]);
  };

  /**
   * For each table you specify in your wdcwConfig.schema method above, you must
   * add a property in the wdcwConfig.tables object. The name of each property
   * must correspond to the tableId you specified in your schema. If you have
   * multiple tables, you will have multiple properties, for example:
   *
   * wdcwConfigs.tables.users = {};
   * wdcwConfigs.tables.comments = {};
   *
   * Each sub-property of the wdcwConfigs.tables object must define a getData
   * method and may optionally define a postProcess method. The getData method
   * is called for each table when Tableau is retrieving data for a table. You
   * may choose to split apart "data collection" logic and "data transformation"
   * logic by keeping your getData method focused on extraction and placing all
   * transformation logic in your postProcess method. Totally up to you. That
   * might look like:
   *
   * wdcwConfigs.tables.users.getData = function () {};
   * wdcwConfigs.tables.users.postProcess = function (data) {};
   * wdcwConfigs.tables.comments.getData = function () {};
   *
   * More details below.
   *
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#registerData
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#registerPostProcess
   */
  wdcwConfig.tables.tableId = {};

  /**
   * Should always return a promise which resolves when data retrieval for the
   * given table is complete. The data passed back when resolved can vary
   * depending on your use-case, see below.
   *
   * @param {string} lastRecord
   *   If this table supports incremental refreshes, the first argument will be
   *   the last value/record of this table's incrementColumnId column. If your
   *   table does not support incremental refreshes or if the execution context
   *   is not an incremental refresh, this parameter will be null.
   *
   * @param {Array.<Array.<any>>|null} tableDependencyData
   *   If you specified an array of tables that this table depends on (via the
   *   dependsOn key in this table's schema definition), then this argument will
   *   be populated with table data for each dependency. The top layer of arrays
   *   will respect the order in which you specified the dependencies in your
   *   schema, underneath which the actual table data resides. If your table
   *   does not depend on the table data of other tables, this parameter will be
   *   null.
   *
   * @param {function} appendRows
   *   In some cases (for example, if you are dealing with a very large number
   *   of records), for performance or resource usage reasons, you may wish to
   *   bypass the WDC Wrapper's data handling and write data directly to Tableau.
   *   If this fits your use-case, you may use this function to do so; it is
   *   identical to the Table.appendRows method in the native Tableau WDC API's
   *   getData method. Note that if you use this, you'll want to resolve this
   *   method with no data, otherwise your data may be duplicated.
   *
   * @return Promise.<Array.<Array.<any>>> | null
   *   In most cases, this promise should resolve with data in the format
   *   exactly as expected by Tableau in the Table.appendRows method of the
   *   native Tableau WDC API. Before being written to Tableau, data resolved
   *   here will be passed directly to the post processing method you have
   *   registered with this table. If you made use of the appendRows parameter
   *   to write data to Tableau directly, you should return NULL here so that
   *   the WDC Wrapper does not do any additional data writing to Tableau.
   *
   * @see https://tableau.github.io/webdataconnector/ref/api_ref.html#webdataconnectorapi.table.appendrows
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#~dataRetrieval
   */
  wdcwConfig.tables.tableId.getData = function (lastRecord) {
    // Access your input option like this to tweak data gathering logic.
    if (this.getConnectionData('FilterValue')) {

    }
    
    // Access select list options like this to tweak data gathering logic.
    if (this.getConnectionData('PizzaToppings') === 'Cheese') {

    }
    
    // Access your textarea option like this to tweak data gathering logic.
    if (this.getConnectionData('JSONString')) {

    }
    

    // Logic to retrieve your data goes here. For example:
    return $.when($.getJSON(buildApiFrom('your/endpoint', {last: lastRecord})));
  };

  /**
   * Function called once all data for a given table has been retrieved. Can be
   * used to transform, filter, or append data for the given table. Should
   * return a promise that resolves to data in the format exactly as expected by
   * Tableau in the Table.appendRows method of the native Tableau WDC API.
   *
   * @param {Array.<Array.<any>>|null} tableData
   *   Contains data as resolved by your table's corresponding dataRetrieval
   *   method. In some exotic use-cases, you may wish for your dataRetrieval to
   *   resolve to "raw" data in a format not expected by Tableau, but then to
   *   process and re-shape the data here into the format expected by Tableau.
   *   This would allow any tables you've declared that depend on this table to
   *   base their data retrieval on the raw data while Tableau gets the properly
   *   formatted version.
   *
   * @return Promise.<Array.<Array.<any>>>
   *   This promise should resolve with data in the format exactly as expected
   *   by Tableau in the Table.appendRows method of the native Tableau WDC API.
   *
   * @see https://tableau-mkt.github.io/wdcw/wdcw.html#~postProcess
   */
  wdcwConfig.tables.tableId.postProcess = function (tableData) {
    var processedData = [];

    // You may need to perform processing to shape the data into an array of
    // objects where each object is a map of column names to values.
    tableData.entities.forEach(function shapeData(entity) {
      processedData.push({
        column1: entity.columnOneValue,
        column2: entity.columnTwoValue
      });
    });

    // Once you've retrieved your data and shaped it into the form expected,
    // resolve it.
    return Promise.resolve(processedData);
  };

  // You can write private methods for use above like this:

  /**
   * Helper function that encapsulates OAuth API access token retrieval.
   */
  getNewAccessToken = function getNewAccessToken() {
    // The exact flow for token retrieval may differ from API to API. Here, you
    // might perform a redirect, check for a temporary code and swap it for the
    // access token, etc. Consult your API's documentation for detailed flow.

    // Once you get a valid OAuth token, store it on tableau.password.
    tableau.password = 'The OAuth access token, once retrieved';
  };

  /**
   * Helper function to build an API endpoint that uses our proxy.
   *
   * @param {string} path
   *   API endpoint path from which to build a full URL.
   *
   * @param {object} opts
   *   Options to inform query parameters and paging.
   */
  buildApiFrom = function buildApiFrom(path, opts) {
    opts = opts || {};
    path = '/proxy?endpoint=' + path;

    // If opts.last was passed, build the URL so the next page is returned.
    if (opts.last) {
      path += '&page=' + opts.last + 1;
    }

    return path;
  };

  return wdcwConfig;
}));
