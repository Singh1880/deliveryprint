sap.ui.define([
    "sap/ui/core/mvc/Controller",
    "sap/ui/model/json/JSONModel",
    "sap/m/MessageBox",
    "sap/ui/core/BusyIndicator",
    "sap/ui/core/Fragment"
], function (Controller, JSONModel, MessageBox, BusyIndicator, Fragment) {
    "use strict";

    return Controller.extend("delprintnew.controller.View1", {
        onInit: function () {
            var oViewModel = new JSONModel();
            this.getView().setModel(oViewModel, "OEMINVModel");
        },

        onGetDataPress: function () {
            var sBillingDocNo = this.getView().byId("BillingDocNO").getValue();
            var oDatePicker = this.getView().byId("datepicker");
            var oTable = this.getView().byId("OEMTable");

            // 1. Validation check
            if (!sBillingDocNo && !oDatePicker.getValue()) {
                sap.m.MessageBox.alert("At least fill one Input field to get data.");
                return;
            }

            sap.ui.core.BusyIndicator.show(0);

            // 2. Reset existing selections
            oTable.removeSelections(true);
            this.selectedRow = undefined;

            // 3. Construct modern UI5 Filter Objects
            var aFilters = [];
            if (sBillingDocNo) {
                aFilters.push(new sap.ui.model.Filter("BillingDocument", sap.ui.model.FilterOperator.EQ, sBillingDocNo));
            }
            if (oDatePicker.getValue()) {
                var oDateValue = oDatePicker.getDateValue();
                var sFormattedDate = oDateValue.getFullYear() + "-" +
                    ("0" + (oDateValue.getMonth() + 1)).slice(-2) + "-" +
                    ("0" + oDateValue.getDate()).slice(-2);
                aFilters.push(new sap.ui.model.Filter("DeliveryDate", sap.ui.model.FilterOperator.EQ, sFormattedDate));
            }

            // 4. Securely bind items aggregation using the default model context
            var oBindingInfo = {
                path: "/ZI_DEL_PRINT_NEW",
                filters: aFilters,
                // FIXED: Added the mandatory template parameter so UI5 knows how to draw the rows
                template: oTable.getBindingInfo("items") ? oTable.getBindingInfo("items").template : oTable.getItems()[0].clone(),
                events: {
                    dataRequested: function () {
                        sap.ui.core.BusyIndicator.show(0);
                    },
                    dataReceived: function (oEvent) {
                        sap.ui.core.BusyIndicator.hide();
                        var oError = oEvent.getParameter("error");
                        if (oError) {
                            console.error("OData Session Binding Error:", oError);
                            sap.m.MessageBox.error("Authorization access block: Please ensure your user role contains catalog 'SAP_SD_BC_BIL_DOC_PC'.");
                        }
                    }
                }
            };

            // Apply the completed binding configuration to the table control
            oTable.bindItems(oBindingInfo);

        },


        onTableSelectionChange: function (oEvent) {
            var sTableId = oEvent.getSource().getId();
            var oTable = this.getView().byId(sTableId);
            var aSelectedItems = oTable.getSelectedItems();
            var aAllItems = oTable.getItems();

            aAllItems.forEach(function (oItem) {
                var aCells = oItem.getCells();
                if (aCells.length >= 4) {
                    var oPrintButton = aCells[4];
                    if (oPrintButton) {
                        oPrintButton.setVisible(aSelectedItems.includes(oItem));
                    }
                }
            });

            var oBindingContext = oEvent.getParameter("listItem").getBindingContext();
            if (oBindingContext) {
                this.selectedRow = oBindingContext.getObject();
            } else {
                MessageBox.warning("No row selected.");
            }
        },

        Generate_DocumentAll: function (oEvent) {
            if (this.selectedRow) {
                var oRowData = this.selectedRow;
                console.log("row", oRowData);

                if (oRowData && oRowData.BillingDocument) {
                    var sBillingDoc = oRowData.BillingDocument;
                    sap.ui.core.BusyIndicator.show(0);

                    // Change this line from UPPERCASE to lowercase:
                    var sHttpServiceUrl = "/sap/bc/http/sap/ZCON_DEL_PRINT_NEW";

                    var sActionName = "PRINT";
                    var sUrl = sHttpServiceUrl + "?action=" + sActionName + "&vbeln=" + sBillingDoc;

                    // FIXED: Switched to jQuery.ajax to carry the Launchpad security cookies and prevent 403 blocks
                    jQuery.ajax({
                        url: sUrl,
                        method: "GET",
                        success: function (sBase64Text) {
                            sap.ui.core.BusyIndicator.hide();

                            if (!sBase64Text) {
                                sap.m.MessageBox.error("Backend service returned an empty print stream payload.");
                                return;
                            }

                            var sCleanBase64 = sBase64Text.trim();
                            var sBinaryString = window.atob(sCleanBase64);
                            var oByteArray = new Uint8Array(sBinaryString.length);
                            for (var i = 0; i < sBinaryString.length; i++) {
                                oByteArray[i] = sBinaryString.charCodeAt(i);
                            }

                            var oPdfBlob = new Blob([oByteArray], {
                                type: "application/pdf"
                            });

                            var sBlobUrl = URL.createObjectURL(oPdfBlob);
                            var oNewWindow = window.open("", "_blank");

                            if (oNewWindow) {
                                var oIframe = document.createElement("iframe");
                                oIframe.src = sBlobUrl;
                                oIframe.style.width = "100%";
                                oIframe.style.height = "100%";
                                oIframe.style.border = "none";

                                oNewWindow.document.body.style.margin = "0";
                                oNewWindow.document.body.appendChild(oIframe);
                                oNewWindow.document.close();
                            } else {
                                sap.m.MessageBox.warning("The browser blocked the print preview popup window tab. Please allow popups for this site.");
                            }
                        },
                        error: function (oError) {
                            sap.ui.core.BusyIndicator.hide();
                            console.error("Print Handler Error:", oError);
                            sap.m.MessageBox.error("Print execution failed with status: " + oError.status + ". Ensure your IAM App catalog is assigned.");
                        }
                    });
                } else {
                    console.error("Selected row does not have a valid BillingDocument.");
                }
            } else {
                console.error("No row selected.");
            }
        },

        onValueHelpRequest: function () {
            var oView = this.getView();

            // Create the dialog lazily
            if (!this._pValueHelpDialog) {
                this._pValueHelpDialog = Fragment.load({
                    id: oView.getId(),
                    name: "delprintnew.fragment.ValueHelpDialog", // Path to your fragment
                    controller: this
                }).then(function (oDialog) {
                    oView.addDependent(oDialog);
                    return oDialog;
                });
            }

            this._pValueHelpDialog.then(function (oDialog) {
                // Open the dialog
                oDialog.open();
            });

        },

        onValueHelpClose: function (oEvent) {
            var oSelectedItem = oEvent.getParameter("selectedItem");
            var oInput = this.byId("BillingDocNO");

            if (oSelectedItem) {
                oInput.setValue(oSelectedItem.getTitle());
            }
        }
    });
});
