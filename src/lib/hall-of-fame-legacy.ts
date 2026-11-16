/**
 * Hall of Fame: podiums of the seasons that ran on iRLM (irleaguemanager.net)
 * before CLS took over. Finished history, so it is a static snapshot, pulled
 * once on 2026-11-16 from the iRLM standings API. Seasons that exist in CLS
 * are NOT in here; those are computed live from the CLS standings.
 * Combined Cup Season 1 was never on iRLM. Generated, do not hand-edit
 * unless correcting a name.
 */
export type HofEntry = { pos: number; name: string; iracingId: string | null; points: number; wins: number };
export type HofStanding = { kind: "overall" | "class" | "team"; label: string; podium: HofEntry[] };
export type HofLegacySeason = { leagueSlug: string; seasonName: string; endedOn: string; source: "iRLM"; standings: HofStanding[] };

export const HOF_LEGACY: HofLegacySeason[] = [
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "1st Season",
  "endedOn": "2023-08-15",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Christopher Limprecht",
      "iracingId": "641681",
      "points": 4325,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Andre Brechmann",
      "iracingId": "781575",
      "points": 4237,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 4229,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "2nd Season",
  "endedOn": "2023-12-05",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Marco Biehl",
      "iracingId": "785314",
      "points": 448,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Dennis Ehrhardt",
      "iracingId": "427773",
      "points": 430,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Stefan Glosemeyer",
      "iracingId": "328036",
      "points": 387,
      "wins": 2
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "3rd Season",
  "endedOn": "2024-02-27",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Nino Hultsch",
      "iracingId": "148258",
      "points": 461,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Sebastian Isenberg",
      "iracingId": "487326",
      "points": 421,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Frank Cizmarek",
      "iracingId": "582368",
      "points": 398,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "4th Season",
  "endedOn": "2024-06-03",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Kevin Sommer",
      "iracingId": "210500",
      "points": 424,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Nino Hultsch",
      "iracingId": "148258",
      "points": 408,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Robin Ries",
      "iracingId": "712233",
      "points": 396,
      "wins": 1
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Kevin Sommer",
      "iracingId": "210500",
      "points": 482,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Nino Hultsch",
      "iracingId": "148258",
      "points": 448,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Robin Ries",
      "iracingId": "712233",
      "points": 444,
      "wins": 1
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Marco Stohr",
      "iracingId": "586518",
      "points": 479,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Manuel Matitschitsch",
      "iracingId": "459027",
      "points": 440,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Jan Tobias Schrader",
      "iracingId": "425985",
      "points": 416,
      "wins": 1
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "GRT - German Racing Team",
      "iracingId": null,
      "points": 712,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 684,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "GermanSimRacing",
      "iracingId": null,
      "points": 424,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "5th Season",
  "endedOn": "2024-09-02",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 485,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Dominik Tar",
      "iracingId": "976147",
      "points": 456,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Robin fischer",
      "iracingId": "431827",
      "points": 406,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 534,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Dominik Tar",
      "iracingId": "976147",
      "points": 508,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Robin fischer",
      "iracingId": "431827",
      "points": 453,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Michael Kelnberger",
      "iracingId": "570291",
      "points": 532,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Michael G Herrmann",
      "iracingId": "159906",
      "points": 508,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Jan Tobias Schrader",
      "iracingId": "425985",
      "points": 433,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 705,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "4K Motorsport Team",
      "iracingId": null,
      "points": 698,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "GSE eSport by Holy",
      "iracingId": null,
      "points": 656,
      "wins": 4
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "6th Season",
  "endedOn": "2024-11-26",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 360,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Chris Geserer",
      "iracingId": "406386",
      "points": 330,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Micha Mueller",
      "iracingId": "50519",
      "points": 324,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 417,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Chris Geserer",
      "iracingId": "406386",
      "points": 398,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Micha Mueller",
      "iracingId": "50519",
      "points": 379,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Michael G Herrmann",
      "iracingId": "159906",
      "points": 385,
      "wins": 1
     },
     {
      "pos": 2,
      "name": "Jan Tobias Schrader",
      "iracingId": "425985",
      "points": 380,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Jack Hill-Evans",
      "iracingId": "841392",
      "points": 377,
      "wins": 4
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 770,
      "wins": 7
     },
     {
      "pos": 2,
      "name": "NoLimit Motorsport 3",
      "iracingId": null,
      "points": 524,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "TwinTurn Simracing by Debeka Bornheim",
      "iracingId": null,
      "points": 394,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "7th Season",
  "endedOn": "2025-03-10",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 452,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Robin fischer",
      "iracingId": "431827",
      "points": 436,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Micha Mueller",
      "iracingId": "50519",
      "points": 392,
      "wins": 1
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 500,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Robin fischer",
      "iracingId": "431827",
      "points": 484,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Micha Mueller",
      "iracingId": "50519",
      "points": 440,
      "wins": 1
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Ralph Holzhäuser",
      "iracingId": "669390",
      "points": 468,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Tim Wagener",
      "iracingId": "1005999",
      "points": 464,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Fabian Hofmann",
      "iracingId": "860827",
      "points": 432,
      "wins": 1
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 848,
      "wins": 10
     },
     {
      "pos": 2,
      "name": "NoLimit Motorsport 3",
      "iracingId": null,
      "points": 720,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Melanzani Racing",
      "iracingId": null,
      "points": 546,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "8th Season",
  "endedOn": "2025-06-09",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 528,
      "wins": 8
     },
     {
      "pos": 2,
      "name": "Micha Mueller",
      "iracingId": "50519",
      "points": 456,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Mike Kaeppner",
      "iracingId": "397960",
      "points": 420,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 582,
      "wins": 8
     },
     {
      "pos": 2,
      "name": "Micha Mueller",
      "iracingId": "50519",
      "points": 510,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Mike Kaeppner",
      "iracingId": "397960",
      "points": 474,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Max Krauss",
      "iracingId": "964998",
      "points": 514,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Jens Jakob",
      "iracingId": "162655",
      "points": 452,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Tim Wagener",
      "iracingId": "1005999",
      "points": 446,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "NoLimit Motorsport 1",
      "iracingId": null,
      "points": 864,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 844,
      "wins": 6
     },
     {
      "pos": 3,
      "name": "Melanzani Racing",
      "iracingId": null,
      "points": 616,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "9th Season",
  "endedOn": "2025-09-08",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 246,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Danielo Filomena",
      "iracingId": "329349",
      "points": 166,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Christian Hartl",
      "iracingId": "539935",
      "points": 163,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 291,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Christian Hartl",
      "iracingId": "539935",
      "points": 214,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Danielo Filomena",
      "iracingId": "329349",
      "points": 208,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Mike Girenz",
      "iracingId": "227997",
      "points": 264,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Nail Hahn",
      "iracingId": "1109148",
      "points": 239,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Hubert Diethard",
      "iracingId": "407036",
      "points": 232,
      "wins": 3
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 372,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Melanzani Racing",
      "iracingId": null,
      "points": 299,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "NoLimit Motorsport 1",
      "iracingId": null,
      "points": 227,
      "wins": 2
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "10th Season",
  "endedOn": "2025-12-08",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 225,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Robin fischer",
      "iracingId": "431827",
      "points": 224,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 221,
      "wins": 4
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 270,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Robin fischer",
      "iracingId": "431827",
      "points": 269,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 266,
      "wins": 4
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Benedikt Naumann",
      "iracingId": "1119604",
      "points": 205,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Felix Naumann",
      "iracingId": "1273499",
      "points": 203,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Hubert Diethard",
      "iracingId": "407036",
      "points": 195,
      "wins": 2
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 438,
      "wins": 7
     },
     {
      "pos": 2,
      "name": "Speed Monkeys",
      "iracingId": null,
      "points": 255,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Melanzani Racing",
      "iracingId": null,
      "points": 222,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-gt3-wct",
  "seasonName": "11th Season",
  "endedOn": "2026-03-09",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Fabio Zeiss",
      "iracingId": "563407",
      "points": 302,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Yannick Wonnenberg",
      "iracingId": "861718",
      "points": 270,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Hendrik Stanzel",
      "iracingId": "388458",
      "points": 229,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Pro",
    "podium": [
     {
      "pos": 1,
      "name": "Fabio Zeiss",
      "iracingId": "563407",
      "points": 347,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Yannick Wonnenberg",
      "iracingId": "861718",
      "points": 310,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Hendrik Stanzel",
      "iracingId": "388458",
      "points": 294,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Am",
    "podium": [
     {
      "pos": 1,
      "name": "Manuel Klopf",
      "iracingId": "955312",
      "points": 336,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Dennis Ulli Richter",
      "iracingId": "574387",
      "points": 323,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Marek Gdański",
      "iracingId": "43549",
      "points": 302,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-iec",
  "seasonName": "2nd Season",
  "endedOn": "2025-02-15",
  "source": "iRLM",
  "standings": [
   {
    "kind": "team",
    "label": "GTP",
    "podium": [
     {
      "pos": 1,
      "name": "GoSquadra eSports",
      "iracingId": null,
      "points": 641,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Next Curve Performance / Purple",
      "iracingId": null,
      "points": 489,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Nürburgring eSports Schwedenkreuz",
      "iracingId": null,
      "points": 465,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "LMP 2",
    "podium": [
     {
      "pos": 1,
      "name": "Mühlner Motorsport by smillaesports",
      "iracingId": null,
      "points": 547,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Twin Turn Simracing",
      "iracingId": null,
      "points": 523,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Eibach Simracing Team 150",
      "iracingId": null,
      "points": 505,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "GT3",
    "podium": [
     {
      "pos": 1,
      "name": "Eibach Simracing Team 2",
      "iracingId": null,
      "points": 471,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "NoLimit Motorsport",
      "iracingId": null,
      "points": 466,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Playing Ducks GT3",
      "iracingId": null,
      "points": 459,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "2nd Season",
  "endedOn": "2024-03-01",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 448,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Andre Brechmann",
      "iracingId": "781575",
      "points": 428,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Ingo Snel",
      "iracingId": "595882",
      "points": 389,
      "wins": 2
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "3rd Season",
  "endedOn": "2024-05-31",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Andre Brechmann",
      "iracingId": "781575",
      "points": 416,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Robert Steiner",
      "iracingId": "597628",
      "points": 355,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Taylor Nelson",
      "iracingId": "946524",
      "points": 340,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Porsche Cup",
    "podium": [
     {
      "pos": 1,
      "name": "Andreas Hoffmann",
      "iracingId": "1004775",
      "points": 227,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Andre Brechmann",
      "iracingId": "781575",
      "points": 173,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 161,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Skip Barber Formula 2000",
    "podium": [
     {
      "pos": 1,
      "name": "Andre Brechmann",
      "iracingId": "781575",
      "points": 234,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Robert Steiner",
      "iracingId": "597628",
      "points": 213,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 169,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "4th Season",
  "endedOn": "2024-09-06",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 459,
      "wins": 7
     },
     {
      "pos": 2,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 368,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 338,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Radical SR 8",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 237,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 216,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 187,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Ray FF 1600",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 198,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Taylor Nelson",
      "iracingId": "946524",
      "points": 168,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Thomas Herbrig",
      "iracingId": "912856",
      "points": 164,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "5th Season",
  "endedOn": "2024-11-29",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 486,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 388,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Robert Steiner",
      "iracingId": "597628",
      "points": 349,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Radical SR 8",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 257,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 201,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 168,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Ray FF 1600",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 252,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 186,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Lars Schäfer",
      "iracingId": "1097285",
      "points": 167,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Destiny Racing Team 1",
      "iracingId": null,
      "points": 529,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Team Lucas Donocik",
      "iracingId": null,
      "points": 519,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 519,
      "wins": 4
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "6th Season",
  "endedOn": "2025-03-07",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 406,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Robert Steiner",
      "iracingId": "597628",
      "points": 378,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 361,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Radical SR 8",
    "podium": [
     {
      "pos": 1,
      "name": "Robert Steiner",
      "iracingId": "597628",
      "points": 202,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 183,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Andre Brechmann",
      "iracingId": "781575",
      "points": 174,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Ray FF 1600",
    "podium": [
     {
      "pos": 1,
      "name": "Patrick Valente Ferro",
      "iracingId": "118377",
      "points": 206,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Kurt Brenkusch",
      "iracingId": "618709",
      "points": 178,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 178,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "7th Season",
  "endedOn": "2025-06-06",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 495,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 456,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 450,
      "wins": 4
     }
    ]
   },
   {
    "kind": "class",
    "label": "Radical SR 8",
    "podium": [
     {
      "pos": 1,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 227,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 208,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 191,
      "wins": 1
     }
    ]
   },
   {
    "kind": "class",
    "label": "Ray FF 1600",
    "podium": [
     {
      "pos": 1,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 219,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 204,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 201,
      "wins": 3
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "8th Season",
  "endedOn": "2025-10-03",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 697,
      "wins": 8
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 652,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 603,
      "wins": 6
     }
    ]
   },
   {
    "kind": "class",
    "label": "TCR",
    "podium": [
     {
      "pos": 1,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 203,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 163,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 156,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Radical SR 8",
    "podium": [
     {
      "pos": 1,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 227,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 214,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 206,
      "wins": 3
     }
    ]
   },
   {
    "kind": "class",
    "label": "Ray FF 1600",
    "podium": [
     {
      "pos": 1,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 247,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 217,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Kurt Brenkusch",
      "iracingId": "618709",
      "points": 199,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 1201,
      "wins": 12
     },
     {
      "pos": 2,
      "name": "CAS Tech Performance gelb",
      "iracingId": null,
      "points": 941,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "CAS Tech Performance blau",
      "iracingId": null,
      "points": 689,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-combined-cup",
  "seasonName": "9th Season",
  "endedOn": "2026-02-06",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 723,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 701,
      "wins": 8
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 650,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "TCR",
    "podium": [
     {
      "pos": 1,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 225,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 217,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 156,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Radical SR 8",
    "podium": [
     {
      "pos": 1,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 209,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 198,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 177,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Ray FF 1600",
    "podium": [
     {
      "pos": 1,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 252,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Thomas Kuebler",
      "iracingId": "479423",
      "points": 235,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 151,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 1195,
      "wins": 12
     },
     {
      "pos": 2,
      "name": "CAS Tech Performance gelb",
      "iracingId": null,
      "points": 900,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "CAS Tech Performance blau",
      "iracingId": null,
      "points": 521,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-sfl-cup",
  "seasonName": "1st Season",
  "endedOn": "2024-05-22",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Janik Gygi",
      "iracingId": "384557",
      "points": 317,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 260,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Dawid Dlugokecki",
      "iracingId": "532947",
      "points": 257,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "United- Sim Sport",
      "iracingId": null,
      "points": 585,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "CAS Tech Performance blau",
      "iracingId": null,
      "points": 538,
      "wins": 4
     },
     {
      "pos": 3,
      "name": "Fastglide Simracing",
      "iracingId": null,
      "points": 387,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-sfl-cup",
  "seasonName": "2nd Season",
  "endedOn": "2024-08-28",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Dawid Dlugokecki",
      "iracingId": "532947",
      "points": 491,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Christian Elsinger",
      "iracingId": "716606",
      "points": 436,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 387,
      "wins": 1
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "CAS Tech Performance blau",
      "iracingId": null,
      "points": 750,
      "wins": 9
     },
     {
      "pos": 2,
      "name": "Fastglide Simracing",
      "iracingId": null,
      "points": 605,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "WildCreek Factory Team",
      "iracingId": null,
      "points": 505,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-sfl-cup",
  "seasonName": "3rd Season",
  "endedOn": "2024-11-20",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Manuel Heuer",
      "iracingId": "228722",
      "points": 363,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Jannik Seitz",
      "iracingId": "325237",
      "points": 332,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Mathias Stiborski",
      "iracingId": "312629",
      "points": 302,
      "wins": 2
     }
    ]
   },
   {
    "kind": "class",
    "label": "Silver",
    "podium": [
     {
      "pos": 1,
      "name": "Riccardo Cavoto",
      "iracingId": "583549",
      "points": 225,
      "wins": 0
     },
     {
      "pos": 2,
      "name": "Justin Jensen",
      "iracingId": "1030787",
      "points": 216,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Thomas Felix",
      "iracingId": "445964",
      "points": 194,
      "wins": 1
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "MedicusKiwiRacing",
      "iracingId": null,
      "points": 620,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Flying Arrow Racing",
      "iracingId": null,
      "points": 504,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Progressive Sim Racing",
      "iracingId": null,
      "points": 404,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-sfl-cup",
  "seasonName": "4th Season",
  "endedOn": "2025-03-05",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Dawid Dlugokecki",
      "iracingId": "532947",
      "points": 380,
      "wins": 3
     },
     {
      "pos": 2,
      "name": "Christian Elsinger",
      "iracingId": "716606",
      "points": 347,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 325,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Slow-Mo eSport Team",
      "iracingId": null,
      "points": 571,
      "wins": 7
     },
     {
      "pos": 2,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 507,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Speed Eagles",
      "iracingId": null,
      "points": 288,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-sfl-cup",
  "seasonName": "5th Season",
  "endedOn": "2025-05-28",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Dawid Dlugokecki",
      "iracingId": "532947",
      "points": 403,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "Andreas Wuschnakowski",
      "iracingId": "820006",
      "points": 313,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Sebastian Muxfeldt",
      "iracingId": "1170283",
      "points": 302,
      "wins": 1
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Slow-Mo eSport Team",
      "iracingId": null,
      "points": 541,
      "wins": 5
     },
     {
      "pos": 2,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 379,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Speed Eagles",
      "iracingId": null,
      "points": 361,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-sfl-cup",
  "seasonName": "6th Season",
  "endedOn": "2025-09-03",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Christian Elsinger",
      "iracingId": "716606",
      "points": 338,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Rainer Hartmann",
      "iracingId": "967525",
      "points": 322,
      "wins": 1
     },
     {
      "pos": 3,
      "name": "Riccardo Cavoto",
      "iracingId": "583549",
      "points": 292,
      "wins": 0
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "Slow-Mo eSport Team",
      "iracingId": null,
      "points": 632,
      "wins": 8
     },
     {
      "pos": 2,
      "name": "WildCreek Factory Team",
      "iracingId": null,
      "points": 439,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 232,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-pccd",
  "seasonName": "1st Season",
  "endedOn": "2025-06-09",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Robert Koppler",
      "iracingId": "739559",
      "points": 562,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Michael Schulze-Kadelbach",
      "iracingId": "1127031",
      "points": 436,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andi Hoffmann",
      "iracingId": "1004775",
      "points": 380,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Silver",
    "podium": [
     {
      "pos": 1,
      "name": "Don Utz",
      "iracingId": "845397",
      "points": 189,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Domenico Monella",
      "iracingId": "934578",
      "points": 166,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Philip Kälin",
      "iracingId": "476124",
      "points": 138,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-pccd",
  "seasonName": "2nd Season",
  "endedOn": "2025-10-09",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Julian Kramer",
      "iracingId": "964812",
      "points": 508,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Andre Rajkovic",
      "iracingId": "172159",
      "points": 400,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Tobias Baier",
      "iracingId": "711934",
      "points": 374,
      "wins": 0
     }
    ]
   },
   {
    "kind": "class",
    "label": "Silver",
    "podium": [
     {
      "pos": 1,
      "name": "Benjamin Schlosser",
      "iracingId": "1124831",
      "points": 228,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Andreas Steinbrink",
      "iracingId": "803349",
      "points": 205,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Don Utz",
      "iracingId": "845397",
      "points": 179,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-pccd",
  "seasonName": "3rd Season",
  "endedOn": "2026-02-19",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Yannick Wonnenberg",
      "iracingId": "861718",
      "points": 544,
      "wins": 6
     },
     {
      "pos": 2,
      "name": "Willi Brand",
      "iracingId": "740091",
      "points": 403,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Andre Rajkovic",
      "iracingId": "172159",
      "points": 382,
      "wins": 1
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-tss-gt4",
  "seasonName": "1st Season",
  "endedOn": "2025-09-15",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Markus Groß",
      "iracingId": "378222",
      "points": 292,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Philip Eckert",
      "iracingId": "249259",
      "points": 272,
      "wins": 2
     },
     {
      "pos": 3,
      "name": "Tobias Baier",
      "iracingId": "711934",
      "points": 232,
      "wins": 0
     }
    ]
   }
  ]
 },
 {
  "leagueSlug": "cas-tss-gt4",
  "seasonName": "2nd Season",
  "endedOn": "2025-12-15",
  "source": "iRLM",
  "standings": [
   {
    "kind": "overall",
    "label": "Overall",
    "podium": [
     {
      "pos": 1,
      "name": "Pit Venanzi",
      "iracingId": "1005962",
      "points": 153,
      "wins": 4
     },
     {
      "pos": 2,
      "name": "Alexander Hoche",
      "iracingId": "718865",
      "points": 132,
      "wins": 0
     },
     {
      "pos": 3,
      "name": "Philip Eckert",
      "iracingId": "249259",
      "points": 128,
      "wins": 1
     }
    ]
   },
   {
    "kind": "team",
    "label": "Teams",
    "podium": [
     {
      "pos": 1,
      "name": "W&S e-Motorsport",
      "iracingId": null,
      "points": 210,
      "wins": 2
     },
     {
      "pos": 2,
      "name": "Firefly eRacing",
      "iracingId": null,
      "points": 198,
      "wins": 3
     },
     {
      "pos": 3,
      "name": "CAS Tech Performance grün",
      "iracingId": null,
      "points": 170,
      "wins": 1
     }
    ]
   }
  ]
 }
];
