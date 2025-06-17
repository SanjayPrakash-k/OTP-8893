/**
 * @NApiVersion 2.1
 * @NScriptType MapReduceScript
 * @NModuleScope SameAccount
 */
/*************************************************************************************
 ***********
 *
 *
 * ${OTP-8893} : ${Monthly Sales Notification for Sales Rep}
 *
 *
 **************************************************************************************
 ********
 *
 * Author: Jobin and Jismi IT Services
 *
 * Date Created : 02-June-2025
 *
 * Description : This script is for sending email to sales rep(in case sales rep is not assigned, email will be sent to admin
 * with an additional message asking to assign the salesrep for the customer) with attached csv file that contain the last month
 * sales details of customer.
 *
 *
 * REVISION HISTORY
 *
 * @version 1.0  :  02-June-2025:  The initial build was created by JJ0404
 *
 *
 *
 *************************************************************************************
 **********/
define(['N/email', 'N/file', 'N/log', 'N/search'],
    /**
 * @param{email} email
 * @param{file} file
 * @param{log} log
 * @param{search} search
 */
    (email, file, log, search) => {
        /**
         * Defines the function that is executed at the beginning of the map/reduce process and generates the input data.
         * @param {Object} inputContext
         * @param {boolean} inputContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Object} inputContext.ObjectRef - Object that references the input data
         * @typedef {Object} ObjectRef
         * @property {string|number} ObjectRef.id - Internal ID of the record instance that contains the input data
         * @property {string} ObjectRef.type - Type of the record instance that contains the input data
         * @returns {Array|Object|Search|ObjectRef|File|Query} The input data to use in the map/reduce process
         * @since 2015.2
         */

        const getInputData = (inputContext) => {
            let searchResult = salesDetailsSearch();
            return searchResult;
        }

        /**
        * Function to create a search
        * @param {void}
        * @returns {search object}
        */
        function salesDetailsSearch(){
            try{
                let monthlySalesSearch = search.create({
                    title: 'Last Month Sale Details JJ',
                    id: 'customsearch_jj_last_month_sales_order',
                    type: 'transaction',

                    filters: 
                    [
                        ["trandate","within","lastmonth"], 
                        "AND", 
                        ["mainline","is","T"], 
                        "AND", 
                        ["type","anyof","CustInvc","CashSale"]
                    ],
                    columns: 
                    [
                        {name: 'tranid'},
                        {name: 'entity'},
                        {name: 'email'},
                        {name: 'amount'},
                        {name: 'salesrep'},
                        {name: 'email', join: 'salesRep'}
                    ]
                });

                let searchResult = monthlySalesSearch.run().getRange({ start: 0, end: 100 });
                return searchResult;
                
            } catch(error) {
                log.error('Unexpected error occured while running search', error.toString());
            }
        }

        /**
         * Defines the function that is executed when the map entry point is triggered. This entry point is triggered automatically
         * when the associated getInputData stage is complete. This function is applied to each key-value pair in the provided
         * context.
         * @param {Object} mapContext - Data collection containing the key-value pairs to process in the map stage. This parameter
         *     is provided automatically based on the results of the getInputData stage.
         * @param {Iterator} mapContext.errors - Serialized errors that were thrown during previous attempts to execute the map
         *     function on the current key-value pair
         * @param {number} mapContext.executionNo - Number of times the map function has been executed on the current key-value
         *     pair
         * @param {boolean} mapContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} mapContext.key - Key to be processed during the map stage
         * @param {string} mapContext.value - Value to be processed during the map stage
         * @since 2015.2
         */

        const map = (mapContext) => {
            processSalesData(mapContext);
        }

        /**
        * Function to process the sales data and covert it into key-value pair
        * @param mapContext
        */
        function processSalesData(mapContext){
            try{
                let parsedSearchResult = JSON.parse(mapContext.value);
                let customerName = parsedSearchResult.values.entity[0].text;
                let customerEmail = parsedSearchResult.values.email;
                let documentNumber = parsedSearchResult.values.tranid; 
                let salesAmount = parsedSearchResult.values.amount; 

                let salesRep = '';
                if(parsedSearchResult.values.salesrep.length === 0){
                    salesRep = 'Unassigned'
                } else {
                    salesRep = parsedSearchResult.values.salesrep[0].value;
                }

                let salesData = customerName + ', ' + customerEmail + ', ' + documentNumber + ', ' + salesAmount;

                mapContext.write({
                    key: salesRep,
                    value: salesData
                });

            } catch(error) {
                log.error('Unexpected error occured during processing sales data', error.toString());
            }
        }

        /**
         * Defines the function that is executed when the reduce entry point is triggered. This entry point is triggered
         * automatically when the associated map stage is complete. This function is applied to each group in the provided context.
         * @param {Object} reduceContext - Data collection containing the groups to process in the reduce stage. This parameter is
         *     provided automatically based on the results of the map stage.
         * @param {Iterator} reduceContext.errors - Serialized errors that were thrown during previous attempts to execute the
         *     reduce function on the current group
         * @param {number} reduceContext.executionNo - Number of times the reduce function has been executed on the current group
         * @param {boolean} reduceContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {string} reduceContext.key - Key to be processed during the reduce stage
         * @param {List<String>} reduceContext.values - All values associated with a unique key that was passed to the reduce stage
         *     for processing
         * @since 2015.2
         */
        const reduce = (reduceContext) => {
            generateSalesReport(reduceContext);
        }

        /**
        * Function to generate csv file with processed sales data
        * @param reduceContext
        */
        function generateSalesReport(reduceContext){
            try{
                let values = JSON.stringify(reduceContext.values)
                
                let csvName = `Previous Month Sales Details For ${reduceContext.key}.csv`;
                let salesRep = reduceContext.key;

                let csvFile = file.create({
                    name: csvName,
                    fileType: file.Type.CSV,
                    contents: values,
                    description: 'The file contains sales details of customer from previous month',
                    folder: -14,
                    encoding: file.Encoding.UTF8,
                    isOnline: true
                });
                csvFile.save();

                let senderId = -5
                let recipient = ''
                let emailSubject = ''
                let emailBody = ''

                if(salesRep != 'Unassigned'){
                    recipient = salesRep;
                    emailSubject = 'Last Month Sales Details of Customers';
                    emailBody = `Hi, 
                    I hope this email finds you well. I have attached the customers sales details to this email. Please check.
                    Thank you`;

                    sendEmail(senderId, recipient, emailSubject, emailBody, csvFile);
                    
                } else {
                    recipient = -5;
                    emailSubject = 'Last Month Sales Details of Customers';
                    emailBody = `Hi,
                    I hope this email finds you well. Please assign a sales rep to the customer. I have attached the customers sales details to this email.
                    Thank you`;

                    sendEmail(senderId, recipient, emailSubject, emailBody, csvFile);
                }

            } catch(error) {
                log.error('Unexpected error occured while creating csv file', error.toString());
            }
        }

        /**
        * Function to send email to sales rep or administrator with created csv file as attachement
        * @param {integer} senderId: internal id of the employee who send the email
        * @param {integer} recipient: internal id of the employee who recieve(sales rep of the customer or admin) the email
        * @param {string} emailSubject: email subject
        * @param {string} emailBody: email body
        * @param {file} csvFile: csv file that contain sales details of customer
        */
        function sendEmail(senderId, recipient, emailSubject, emailBody, csvFile){
            try{
                email.send({
                    author: senderId,
                    recipients: recipient,
                    subject: emailSubject,
                    body: emailBody,
                    attachments: [csvFile]
                });
            } catch(error) {
                log.error('Unexpected error occured while sending email', error.toString());
            }
        }

        /**
         * Defines the function that is executed when the summarize entry point is triggered. This entry point is triggered
         * automatically when the associated reduce stage is complete. This function is applied to the entire result set.
         * @param {Object} summaryContext - Statistics about the execution of a map/reduce script
         * @param {number} summaryContext.concurrency - Maximum concurrency number when executing parallel tasks for the map/reduce
         *     script
         * @param {Date} summaryContext.dateCreated - The date and time when the map/reduce script began running
         * @param {boolean} summaryContext.isRestarted - Indicates whether the current invocation of this function is the first
         *     invocation (if true, the current invocation is not the first invocation and this function has been restarted)
         * @param {Iterator} summaryContext.output - Serialized keys and values that were saved as output during the reduce stage
         * @param {number} summaryContext.seconds - Total seconds elapsed when running the map/reduce script
         * @param {number} summaryContext.usage - Total number of governance usage units consumed when running the map/reduce
         *     script
         * @param {number} summaryContext.yields - Total number of yields when running the map/reduce script
         * @param {Object} summaryContext.inputSummary - Statistics about the input stage
         * @param {Object} summaryContext.mapSummary - Statistics about the map stage
         * @param {Object} summaryContext.reduceSummary - Statistics about the reduce stage
         * @since 2015.2
         */
        const summarize = (summaryContext) => {
            log.debug('Email Send Successfully');
        }

        return {getInputData, map, reduce, summarize}

    });