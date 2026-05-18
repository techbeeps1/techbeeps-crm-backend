const DocumentTemplate = require('../models/documentTemplateModel');

const designData = {
    body: {
        "rows": [
            {
                "id": "wqxrxE511n",
                "cells": [1],
                "columns": [
                    {
                        "id": "Md0WSm3GhD",
                        "contents": [
                            {
                                "id": "kGqiwQSXrN",
                                "type": "image",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "src": {
                                        "url": "https://assets.unlayer.com/stock-templates1695209341267-uni3.png",
                                        "width": 348,
                                        "height": 276,
                                        "autoWidth": false,
                                        "maxWidth": "23%"
                                    },
                                    "textAlign": "center",
                                    "altText": "",
                                    "action": {
                                        "name": "web",
                                        "values": {
                                            "href": "",
                                            "target": "_blank"
                                        }
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_image_2",
                                        "htmlClassNames": "u_content_image"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true
                                }
                            },
                            {
                                "id": "O4v8H7lJ5r",
                                "type": "heading",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "headingType": "h1",
                                    "fontSize": "22px",
                                    "textAlign": "center",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_heading_1",
                                        "htmlClassNames": "u_content_heading"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<span style=\"color: #ffffff; text-align: center; white-space: normal; background-color: #021b4e; float: none; display: inline;\">Appointment change</span>"
                                }
                            }
                        ],
                        "values": {
                            "backgroundColor": "",
                            "padding": "0px",
                            "borderRadius": "0px",
                            "_meta": {
                                "htmlID": "u_column_5",
                                "htmlClassNames": "u_column"
                            }
                        }
                    }
                ],
                "values": {
                    "displayCondition": null,
                    "columns": false,
                    "backgroundColor": "#e66e0b",
                    "columnsBackgroundColor": "#e95223",
                    "backgroundImage": {
                        "url": "",
                        "fullWidth": true,
                        "repeat": "no-repeat",
                        "size": "custom",
                        "position": "center"
                    },
                    "padding": "0px",
                    "anchor": "",
                    "_meta": {
                        "htmlID": "u_row_5",
                        "htmlClassNames": "u_row"
                    },
                    "selectable": true,
                    "draggable": true,
                    "duplicatable": true,
                    "deletable": true,
                    "hideable": true
                }
            },
            {
                "id": "mxI5KoZTRH",
                "cells": [1],
                "columns": [
                    {
                        "id": "pQslCMlVlg",
                        "contents": [
                            {
                                "id": "tVZsmo0Eqn",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "left",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_1",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"><span style=\"line-height: 19.6px;\">Dear {{customer.name}},</span></p>\n<p style=\"line-height: 140%;\"> </p>\n<p style=\"line-height: 140%;\"><span style=\"line-height: 19.6px;\">One or more appointments have been changed, below you will find an overview of all changed appointments.</span></p>\n<p style=\"line-height: 140%;\"> </p>\n<p style=\"line-height: 140%;\"><span style=\"line-height: 19.6px;\"><span style=\"line-height: 19.6px;\">{{event.eventType}} - {{event.date}} from {{event.start}} to {{event.end}}</span></span></p>\n<p style=\"line-height: 140%;\"> </p>\n<p style=\"line-height: 140%;\"><span style=\"line-height: 19.6px;\"><span style=\"line-height: 19.6px;\"><span style=\"line-height: 19.6px;\">Sincerely,<br />{{identity.companyName}}</span></span></span></p>"
                                }
                            },
                            {
                                "id": "gVhsBI_Dz6",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "center",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_2",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"><span style=\"line-height: 19.6px; color: #7e8c8d;\">If the appointment does not match, we would like to hear from you.</span><br /><span style=\"color: #7e8c8d; line-height: 19.6px;\"><span style=\"line-height: 19.6px;\">Below you will <span style=\"line-height: 19.6px;\">find</span> our contact details.</span>.</span></p>"
                                }
                            },
                            {
                                "id": "XdfD1K2sIh",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "left",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_3",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p dir=\"ltr\" style=\"line-height: 140%; text-align: left;\"><span style=\"line-height: 19.6px; color: #000000;\">Contact:<br />{{identity.companyName}}</span></p>\n<p dir=\"ltr\" style=\"line-height: 140%; text-align: left;\"><span style=\"line-height: 19.6px; color: #000000;\">{{identity.address.streetName}} {{identity.address.houseNumberIncludingAddition}}<br />{{identity.address.zipCode}} {{identity.address.city}}</span></p>\n<p dir=\"ltr\" style=\"line-height: 140%; text-align: left;\"><span style=\"color: #000000; line-height: 19.6px;\"><a rel=\"noopener\" href=\"mailto:{{identity.emailAddress}}?subject=&body=\" target=\"_blank\" style=\"color: #000000;\" data-u-link-value=\"eyJuYW1lIjoiZW1haWwiLCJhdHRycyI6eyJocmVmIjoibWFpbHRvOnt7ZW1haWx9fT9zdWJqZWN0PXt7c3ViamVjdH19JmJvZHk9e3tib2R5fX0ifSwidmFsdWVzIjp7ImVtYWlsIjoie3tpZGVudGl0eS5lbWFpbEFkZHJlc3N9fSIsInN1YmplY3QiOiIiLCJib2R5IjoiIn19\">{{identity.emailAddress}}</a></span></p>\n<p dir=\"ltr\" style=\"line-height: 140%; text-align: left;\"><span style=\"color: #000000; line-height: 19.6px;\">{{identity.phoneNumber}}</span></p>"
                                }
                            },
                            {
                                "id": "mj18rFCNdF",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "center",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_4",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"><span style=\"line-height: 19.6px; color: #000000;\"><span style=\"line-height: 19.6px;\">{{identity.companyName}} ©  All Rights Reserved</span></span></p>"
                                }
                            }
                        ],
                        "values": {
                            "backgroundColor": "",
                            "padding": "0px",
                            "borderRadius": "0px",
                            "_meta": {
                                "htmlID": "u_column_7",
                                "htmlClassNames": "u_column"
                            }
                        }
                    }
                ],
                "values": {
                    "displayCondition": null,
                    "columns": false,
                    "backgroundColor": "",
                    "columnsBackgroundColor": "",
                    "backgroundImage": {
                        "url": "",
                        "fullWidth": true,
                        "repeat": "no-repeat",
                        "size": "custom",
                        "position": "center"
                    },
                    "padding": "0px",
                    "anchor": "",
                    "_meta": {
                        "htmlID": "u_row_7",
                        "htmlClassNames": "u_row"
                    },
                    "selectable": true,
                    "draggable": true,
                    "duplicatable": true,
                    "deletable": true,
                    "hideable": true
                }
            },
            {
                "id": "woyaPkI7ES",
                "cells": [1, 1, 1, 1],
                "columns": [
                    {
                        "id": "GIgUMDCEgW",
                        "contents": [
                            {
                                "id": "n_0i4MNn9d",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "left",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_5",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"> <span style=\"color: #ffffff; text-align: center; white-space: normal; background-color: #e67523; float: none; display: inline; line-height: 19.6px;\"> +31 0852031144</span> </p>"
                                }
                            }
                        ],
                        "values": {
                            "backgroundColor": "",
                            "padding": "0px",
                            "borderRadius": "0px",
                            "_meta": {
                                "htmlID": "u_column_8",
                                "htmlClassNames": "u_column"
                            }
                        }
                    },
                    {
                        "id": "sBE0kn-tqy",
                        "contents": [
                            {
                                "id": "bfcjM7YCtM",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "left",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_6",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"><span style=\"color: #ffffff; text-align: center; white-space: normal; background-color: #e67523; float: none; display: inline; line-height: 19.6px;\"> +31 638613325</span></p>"
                                }
                            }
                        ],
                        "values": {
                            "backgroundColor": "",
                            "padding": "0px",
                            "borderRadius": "0px",
                            "_meta": {
                                "htmlID": "u_column_9",
                                "htmlClassNames": "u_column"
                            }
                        }
                    },
                    {
                        "id": "GzHsyajNQp",
                        "contents": [
                            {
                                "id": "vRO7D70jrZ",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "left",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_7",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"><span style=\"color: #ffffff; text-align: center; white-space: normal; background-color: #e67523; float: none; display: inline; line-height: 19.6px;\">info@universalmovers.nl</span> </p>"
                                }
                            }
                        ],
                        "values": {
                            "backgroundColor": "",
                            "padding": "0px",
                            "borderRadius": "0px",
                            "_meta": {
                                "htmlID": "u_column_10",
                                "htmlClassNames": "u_column"
                            }
                        }
                    },
                    {
                        "id": "ZmBVUNfGlv",
                        "contents": [
                            {
                                "id": "N5_JPLHbrl",
                                "type": "text",
                                "values": {
                                    "containerPadding": "10px",
                                    "anchor": "",
                                    "fontSize": "14px",
                                    "textAlign": "left",
                                    "lineHeight": "140%",
                                    "linkStyle": {
                                        "inherit": true,
                                        "linkColor": "#0000ee",
                                        "linkHoverColor": "#0000ee",
                                        "linkUnderline": true,
                                        "linkHoverUnderline": true
                                    },
                                    "displayCondition": null,
                                    "_meta": {
                                        "htmlID": "u_content_text_8",
                                        "htmlClassNames": "u_content_text"
                                    },
                                    "selectable": true,
                                    "draggable": true,
                                    "duplicatable": true,
                                    "deletable": true,
                                    "hideable": true,
                                    "text": "<p style=\"line-height: 140%;\"><span style=\"color: #ffffff; text-align: center; white-space: normal; background-color: #e67523; float: none; display: inline; line-height: 19.6px;\"><a href=\"www.universalmovers.nl\">www.universalmovers.nl</a></span></p>"
                                }
                            }
                        ],
                        "values": {
                            "backgroundColor": "",
                            "padding": "0px",
                            "borderRadius": "0px",
                            "_meta": {
                                "htmlID": "u_column_11",
                                "htmlClassNames": "u_column"
                            }
                        }
                    }
                ],
                "values": {
                    "displayCondition": null,
                    "columns": false,
                    "backgroundColor": "#f06712",
                    "columnsBackgroundColor": "",
                    "backgroundImage": {
                        "url": "",
                        "fullWidth": true,
                        "repeat": "no-repeat",
                        "size": "custom",
                        "position": "center"
                    },
                    "padding": "0px",
                    "anchor": "",
                    "_meta": {
                        "htmlID": "u_row_8",
                        "htmlClassNames": "u_row"
                    },
                    "selectable": true,
                    "draggable": true,
                    "duplicatable": true,
                    "deletable": true,
                    "hideable": true
                }
            }
        ],
        "values": {
            "popupPosition": "center",
            "popupWidth": "600px",
            "popupHeight": "auto",
            "borderRadius": "10px",
            "contentAlign": "center",
            "contentVerticalAlign": "center",
            "contentWidth": "500px",
            "fontFamily": {
                "label": "Arial",
                "value": "arial,helvetica,sans-serif"
            },
            "textColor": "#000000",
            "popupBackgroundColor": "#FFFFFF",
            "popupBackgroundImage": {
                "url": "",
                "fullWidth": true,
                "repeat": "no-repeat",
                "size": "cover",
                "position": "center"
            },
            "popupOverlay_backgroundColor": "rgba(0, 0, 0, 0.1)",
            "popupCloseButton_position": "top-right",
            "popupCloseButton_backgroundColor": "#DDDDDD",
            "popupCloseButton_iconColor": "#000000",
            "popupCloseButton_borderRadius": "0px",
            "popupCloseButton_margin": "0px",
            "popupCloseButton_action": {
                "name": "close_popup",
                "attrs": {
                    "onClick": "document.querySelector('.u-popup-container').style.display = 'none';"
                }
            },
            "backgroundColor": "#e7e7e7",
            "backgroundImage": {
                "url": "",
                "fullWidth": true,
                "repeat": "no-repeat",
                "size": "custom",
                "position": "center"
            },
            "preheaderText": "",
            "linkStyle": {
                "body": true,
                "linkColor": "#0000ee",
                "linkHoverColor": "#0000ee",
                "linkUnderline": true,
                "linkHoverUnderline": true
            },
            "_meta": {
                "htmlID": "u_body",
                "htmlClassNames": "u_body"
            }
        }
    },
    "counters": {
        "u_column": 11,
        "u_row": 8,
        "u_content_image": 2,
        "u_content_text": 8,
        "u_content_heading": 1
    },
}

exports.createDocumentTemplate = async (req, res) => {
    const { name, link_template, documentType, templateType, expiryPeriod } = req.body;
    try {
        let htmlDesign;
        if (link_template) {
            const existingTemplate = await DocumentTemplate.findById(link_template);
            if (!existingTemplate) {
                return res.status(404).json({ message: 'Linked template not found' });
            }
            htmlDesign = existingTemplate.htmlDesign;
        } else {
            htmlDesign = req.body.htmlDesign || designData;
        }
        const newTemplate = new DocumentTemplate({
            name,
            link_template,
            documentType,
            templateType,
            expiryPeriod,
            htmlDesign 
        });
        await newTemplate.save();
        res.status(201).json({ message: 'Document template created successfully', newTemplate });
    } catch (error) {
        res.status(500).json({ message: 'Error creating document template', error });
    }
};

exports.getDocumentTemplates = async (req, res) => {
    const { type } = req.query;
    const filter = {};
    if (type) {
        filter.documentType = type;
    }
    try {
        const templates = await DocumentTemplate.find(filter).select('name _id documentType templateType expiryPeriod');
        res.status(200).json(templates);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching document templates', error });
    }
};

exports.getDocumentTemplateById = async (req, res) => {
    const { id } = req.params;
    try {
        const template = await DocumentTemplate.findById(id);
        if (!template) {
            return res.status(404).json({ message: 'Document template not found' });
        }
        res.status(200).json(template);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching document template', error });
    }
};
exports.updateDocumentTemplate = async (req, res) => {
    const { id } = req.params;
    const { name, documentType, templateType, expiryDuration, htmlDesign,htmlContent } = req.body;
    const expiryTime = new Date();
    expiryTime.setDate(expiryTime.getDate() + expiryDuration);
    try {
        const updatedTemplate = await DocumentTemplate.findByIdAndUpdate(
            id,
            { name, documentType, templateType, expiryTime, htmlDesign,htmlContent },
            { new: true }
        );
        res.status(200).json({ message: 'Document template updated successfully', updatedTemplate });
    } catch (error) {
        res.status(500).json({ message: 'Error updating document template', error });
    }
};

exports.deleteDocumentTemplate = async (req, res) => {
    const { id } = req.params;
    try {
        await DocumentTemplate.findByIdAndDelete(id);
        res.status(200).json({ message: 'Document template deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting document template', error });
    }
};
