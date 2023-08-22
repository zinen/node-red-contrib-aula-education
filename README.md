# node-red-contrib-aula
Node-Red Node for collecting data from aula the danish educational platform.

[![Platform](https://img.shields.io/badge/platform-Node--RED-red.svg)](https://nodered.org)

This node is based on the home assistant unoffical (hacs) addon to get Aula data made by scaarup https://github.com/scaarup/aula. But converted to javascript and put into a node-red node.

A lot of data is returned form API. Some examples on how to parse the incoming data is added.

**How to import:**
Menu top right -> Import -> Examples -> node-red-contrib-nibeuplink -> basic


Example of what is returned in home assistant as state info. The same and more info is returned by this node.
```yaml
location: null
sleepIntervals:
  - id: 61297321
    startTime: '12:00:00'
    endTime: '13:00:00'
checkInTime: '07:38'
checkOutTime: '15:34'
activityType: 0
entryTime: '07:30'
exitTime: '16:00'
exitWith: {Person name}
comment: null
spareTimeActivity: null
selfDeciderStartTime: null
selfDeciderEndTime: null
profilePicture: >-
  https://media-prod.aula.dk/12345/13456/1mk23j1_400x400.jpg?response-content-disposition=attachment%3Bfilename%3D%21315sa3fa4_400x400.jpg%22&Expires=1692734400&Signature=asdaasdaULlo2-5ksfsd79XTfdsix4lr-2IsfsdfF7~G7VEsdfsdSclbCxJV~hoSu2n0AZTQQWYL3R0-QhIgz-UoBSCtpnM6A7qPuPBcf6qBz-XeJsdfsdKsZCwA5fsdfcTsqWMI1nVsP5YN7h6SuRZgOVxC3kCyykozW4UYXks~3yJbN3jkD6tlsyPYDw2aeYQ6vPE0KnRwPJJZTb3QncPG2NC9kJnX8W4dfhfdhsadpyGTCKXwQ~5r8P3p-~w0H62ig42dy-VKNZUDH4IsVimPasdghrhd345n55R0TiflCf5MsFfnb2g__&Key-Pair-Id=asdaKAILBPEasdasd1234IBROXQ
icon: mdi:account-school
friendly_name: {Institusion name} {First name}

```

The addon made by scaarup in python for home assistant does support more then what I converted and tested here. PRs are welcomed. E.g. scaarup also extracts calender info and messeges. I have not been able test any of this so I didn't convert that part.