// Course catalogs registry module
const CALCULUS_LECTURES = [
    {
        "rank": 1,
        "title": "Calculus for JEE Advanced Lec 1",
        "uid": "371ARO0LCZM7PJUQ2JAU",
        "duration": "2h 36m"
    },
    {
        "rank": 2,
        "title": "Calculus for JEE Advanced Lec 2",
        "uid": "13HDZMHVYTX1V668LRVP",
        "duration": "2h 28m"
    },
    {
        "rank": 3,
        "title": "Calculus for JEE Advanced Lec 3",
        "uid": "C5LCAX59LMNF7S7398GN",
        "duration": "8m"
    },
    {
        "rank": 4,
        "title": "Calculus for JEE Advanced Lec 4",
        "uid": "E16AKBQQVQNPW8XQ8M0I",
        "duration": "2h 32m"
    },
    {
        "rank": 5,
        "title": "Calculus for JEE Advanced Lec 5",
        "uid": "N9404PDGNU88SRW68DFI",
        "duration": "2h 41m"
    },
    {
        "rank": 6,
        "title": "Calculus for JEE Advanced Lec 6",
        "uid": "U8PPT4PICJM88V4DVOF0",
        "duration": "2h 44m"
    },
    {
        "rank": 7,
        "title": "Calculus for JEE Advanced Lec 7",
        "uid": "VRHSIRO8CFBRKUSNHKSK",
        "duration": "2h 38m"
    },
    {
        "rank": 8,
        "title": "Calculus for JEE Advanced Lec 8",
        "uid": "GZT66ZD5USBGA78THJ0Y",
        "duration": "2h 42m"
    },
    {
        "rank": 9,
        "title": "Calculus for JEE Advanced Lec 9",
        "uid": "PNTQFTCTS7BVUNM67MKU",
        "duration": "2h 20m"
    },
    {
        "rank": 10,
        "title": "Calculus for JEE Advanced Lec 10",
        "uid": "5BM3I7OBM82AEGW632MT",
        "duration": "1h 57m"
    },
    {
        "rank": 11,
        "title": "Calculus for JEE Advanced Lec 11",
        "uid": "KMW1QSCQT4AHZXMLBUAT",
        "duration": "3h 39m"
    },
    {
        "rank": 12,
        "title": "Calculus for JEE Advanced Lec 12",
        "uid": "OO0W0EQK07OREHKU8PZD",
        "duration": "2h 33m"
    },
    {
        "rank": 13,
        "title": "Calculus for JEE Advanced Lec 13",
        "uid": "BFUDOF04ZKHYF67GYOJ8",
        "duration": "2h 18m"
    },
    {
        "rank": 14,
        "title": "Calculus for JEE Advanced Lec 14",
        "uid": "Q1IBVO03ZK45IRWH8LQ9",
        "duration": "2h 33m"
    },
    {
        "rank": 15,
        "title": "Calculus for JEE Advanced Lec 15",
        "uid": "97WAW73ED4UMMW963NP1",
        "duration": "2h 20m"
    },
    {
        "rank": 16,
        "title": "Calculus for JEE Advanced Lec 16",
        "uid": "239T28ED98D6IIDTH5F6",
        "duration": "2h 39m"
    },
    {
        "rank": 17,
        "title": "Calculus for JEE Advanced Lec 17",
        "uid": "9ZIMRQW9OIPSF6UYXNV0",
        "duration": "2h 26m"
    },
    {
        "rank": 18,
        "title": "Calculus for JEE Advanced Lec 18",
        "uid": "3C0CXNDZ32MQR0D7LI6E",
        "duration": "1h 38m"
    },
    {
        "rank": 19,
        "title": "Calculus for JEE Advanced Lec 19",
        "uid": "YWPFYZL3802JJXE8Y9O7",
        "duration": "2h 32m"
    },
    {
        "rank": 20,
        "title": "Calculus for JEE Advanced Lec 20",
        "uid": "B0OQVW56O8D6HV3BMV01",
        "duration": "2h 37m"
    },
    {
        "rank": 21,
        "title": "Calculus for JEE Advanced Lec 21",
        "uid": "IUA1UE5FGPZKLE7LZH50",
        "duration": "2h 41m"
    },
    {
        "rank": 22,
        "title": "Calculus for JEE Advanced Lec 22",
        "uid": "W7BVS9QM651AZQ414H39",
        "duration": "2h 18m"
    },
    {
        "rank": 23,
        "title": "Calculus for JEE Advanced Lec 23",
        "uid": "AEBOHYHHPOUEQF1U36R9",
        "duration": "2h 38m"
    },
    {
        "rank": 24,
        "title": "Calculus for JEE Advanced Lec 24",
        "uid": "6904GBH75TID7GEZHMW8",
        "duration": "2h 28m"
    },
    {
        "rank": 25,
        "title": "Calculus for JEE Advanced Lec 25",
        "uid": "FBFFTJ4T2HQZZSS7F77D",
        "duration": "2h 11m"
    },
    {
        "rank": 26,
        "title": "Calculus for JEE Advanced Lec 26",
        "uid": "TK3Y8BHUJXC2941KERU0",
        "duration": "2h 30m"
    },
    {
        "rank": 27,
        "title": "Calculus for JEE Advanced Lec 27",
        "uid": "BOSGDGUPHY0PVHTUZW4R",
        "duration": "1h 48m"
    },
    {
        "rank": 28,
        "title": "Calculus for JEE Advanced Lec 28",
        "uid": "TBEHC82VP8GGEIN7O82L",
        "duration": "2h 43m"
    },
    {
        "rank": 29,
        "title": "Calculus for JEE Advanced Lec 29",
        "uid": "CKAT2KFGEYUCTRZG4Z9S",
        "duration": "2h 24m"
    },
    {
        "rank": 30,
        "title": "Calculus for JEE Advanced Lec 30",
        "uid": "IXUAGZACIVN10A0LTCCV",
        "duration": "2h 23m"
    },
    {
        "rank": 31,
        "title": "Calculus for JEE Advanced Lec 31",
        "uid": "LDML9VTNJA6H8UZKV9NR",
        "duration": "2h 38m"
    },
    {
        "rank": 32,
        "title": "Calculus for JEE Advanced Lec 32",
        "uid": "7I16MP9ILVG7QJSS63S5",
        "duration": "2h 16m"
    },
    {
        "rank": 33,
        "title": "Calculus for JEE Advanced Lec 33",
        "uid": "96F9RJRLPJYYQKHDXYC7",
        "duration": "2h 41m"
    },
    {
        "rank": 34,
        "title": "Calculus for JEE Advanced Lec 34",
        "uid": "WBJSA4A5GWTOTNOE8WEW",
        "duration": "2h 40m"
    },
    {
        "rank": 35,
        "title": "Calculus for JEE Advanced Lec 35",
        "uid": "455VV39L2P2QWEONP6XQ",
        "duration": "2h 7m"
    },
    {
        "rank": 36,
        "title": "Discussion Class",
        "uid": "ZHZIE04M7E1RF8S52UQD",
        "duration": "1h 10m"
    },
    {
        "rank": 37,
        "title": "Calculus for JEE Advanced Lec 36",
        "uid": "Y2CEILJQEA6GOW4SP6UB",
        "duration": "2h 37m"
    },
    {
        "rank": 38,
        "title": "Calculus for JEE Advanced Lec 37",
        "uid": "6JU4WZJDBX1T3EHOJUX8",
        "duration": "2h 42m"
    },
    {
        "rank": 39,
        "title": "Calculus for JEE Advanced Lec 38",
        "uid": "XJHKS26EO5RSBJJU0WDL",
        "duration": "2h 32m"
    },
    {
        "rank": 40,
        "title": "Calculus for JEE Advanced Lec 39",
        "uid": "1VSNJTC44XY0VMUFR9B9",
        "duration": "2h 40m"
    },
    {
        "rank": 41,
        "title": "Calculus for JEE Advanced Lec 40",
        "uid": "RDVGDZOPOM2L10XG1JR9",
        "duration": "2h 44m"
    },
    {
        "rank": 42,
        "title": "Calculus for JEE Advanced Lec 41",
        "uid": "CXP4GZ1VNO3ZVR4S8GOM",
        "duration": "2h 33m"
    },
    {
        "rank": 43,
        "title": "Calculus for JEE Advanced Lec 42",
        "uid": "3CUZ0T883H95GTINNJST",
        "duration": "1h 28m"
    },
    {
        "rank": 44,
        "title": "Calculus for JEE Advanced Lec 43",
        "uid": "GR9R3R31NI08B0OVZD4Q",
        "duration": "2h 24m"
    },
    {
        "rank": 45,
        "title": "Calculus for JEE Advanced Lec 44",
        "uid": "0TH1OQFIINGVYDPA8S85",
        "duration": "2h 43m"
    },
    {
        "rank": 46,
        "title": "Calculus for JEE Advanced Lec 45",
        "uid": "U9U8Y87P5D5S8BIWJY81",
        "duration": "1h 46m"
    },
    {
        "rank": 47,
        "title": "Calculus for JEE Advanced Lec 46",
        "uid": "0M54MUO7EYBMMGEBFCI1",
        "duration": "2h 37m"
    },
    {
        "rank": 48,
        "title": "Calculus for JEE Advanced Lec 47",
        "uid": "G7C1QBLXE9KKQZQEINRD",
        "duration": "2h 47m"
    }
];

        let activeUid = "371ARO0LCZM7PJUQ2JAU"; // Default to Lec 1

        const ALGEBRA_LECTURES = [
    {
        "rank": 1,
        "title": "Algebra L01 : Beginning of Algebra, Cubic formula & some elementary results",
        "uid": "NONCJKE7WF6MO8TV5VC3",
        "duration": "2h 34m"
    },
    {
        "rank": 2,
        "title": "Algebra Lec 02",
        "uid": "YPUK1MTK2C3XOWV9RZ4R",
        "duration": "2h 30m"
    },
    {
        "rank": 3,
        "title": "Algebra Lec 03",
        "uid": "CZX0YLRYYNELHGM4YDF1",
        "duration": "2h 14m"
    },
    {
        "rank": 4,
        "title": "Algebra Lec 04",
        "uid": "T1SYU80OO3XPEC4ZJ0Q0",
        "duration": "53m"
    },
    {
        "rank": 5,
        "title": "Algebra Lec05 : Generalising quadratic and cubic",
        "uid": "JMR8OSXX4ZQS93NVNUH9",
        "duration": "2h 14m"
    },
    {
        "rank": 6,
        "title": "Algebra Lec 06: Cardano's Cubic Formula, Exponents, Surds, Binomials and FPS",
        "uid": "HKCR5ISAPOQVP56W76NH",
        "duration": "2h 43m"
    },
    {
        "rank": 7,
        "title": "Algebra Lec 07: Biquadratic, Transformation of Equations, Vieta and FTA",
        "uid": "QFVJHHUNXMXKS4QAVBLK",
        "duration": "2h 22m"
    },
    {
        "rank": 8,
        "title": "Algebra Lec 08: Theory of Indices and Polynomial theorems",
        "uid": "XGQNQOUMD6447B2AEDPJ",
        "duration": "2h 26m"
    },
    {
        "rank": 9,
        "title": "Algebra Lec 09",
        "uid": "6IAEXKANIEIQOZLZQX79",
        "duration": "2h 14m"
    },
    {
        "rank": 10,
        "title": "Algebra Lec 10",
        "uid": "N4IGYUWXHLC44AA5LJHY",
        "duration": "2h 20m"
    },
    {
        "rank": 11,
        "title": "Algebra Lec 11: Algebraic Identities, Newton's observations, Polynomial Theorems",
        "uid": "W1AKEE7VHG29Y5CLPTTF",
        "duration": "2h 35m"
    },
    {
        "rank": 12,
        "title": "Algebra Lec 12: A brilliant generalization , Advanced Algebraic manipulations and Factorization",
        "uid": "4JI4C5S2IX3R4UYSZZ1M",
        "duration": "2h 32m"
    },
    {
        "rank": 13,
        "title": "Algebra Lec 13",
        "uid": "IWEK8LDL749OMB5MUDDB",
        "duration": "2h 36m"
    },
    {
        "rank": 14,
        "title": "Algebra L14 : Reciprocal Equations, Idea of complex Numbers ,Nature of Roots",
        "uid": "WKE2TRDWPY3PDSNKP5OR",
        "duration": "2h 34m"
    },
    {
        "rank": 15,
        "title": "Algebra L15 : Nature of Roots and final theorems",
        "uid": "8P0OBHSB9BGGDEBEUIEL",
        "duration": "2h 35m"
    },
    {
        "rank": 16,
        "title": "Algebra L16 : Problem Solving Situation Set 01",
        "uid": "5QK6MML0WSITIUHTZQWA",
        "duration": "2h 33m"
    },
    {
        "rank": 17,
        "title": "Algebra L17 : Problem Solving Situation Set 02",
        "uid": "6ER69OIVN7XIOA8QRIB5",
        "duration": "2h 39m"
    },
    {
        "rank": 18,
        "title": "Algebra L18 : Problem Solving Situation Set 03",
        "uid": "EYDBQE4SJVH5W2SW7185",
        "duration": "2h 31m"
    },
    {
        "rank": 19,
        "title": "Algebra L19 : Problem Solving Situation Set 03",
        "uid": "Y8AS7A6ZOQDC0EWT5VW8",
        "duration": "2h 50m"
    },
    {
        "rank": 20,
        "title": "Complete Discussion of Algebra-I Sheet & JEE ADV PYQs",
        "uid": "KDCS5WH47U3HOQ83SWYV",
        "duration": "2h 18m"
    }
];

        const COURSES = [
            {
                id: "calculus-1",
                title: "Calculus for JEE Advanced",
                subtitle: "Part I - Sandal Agarwal",
                description: "Comprehensive Advanced Calculus course covering Functions, Limits, Continuity, Differentiability, derivatives, and graphs. Includes annotated slide replays.",
                lectures: CALCULUS_LECTURES,
                icon: "fa-calculator",
                badge: "48 Lectures"
            },
            {
                id: "algebra-1",
                title: "Algebra for JEE Advanced",
                subtitle: "Part I - Sandal Agarwal",
                description: "Advanced Algebra covering Algebraic Identities, Cardano's Cubic Formula, Reciprocal Equations, complex numbers, and polynomials.",
                lectures: ALGEBRA_LECTURES,
                icon: "fa-square-root-variable",
                badge: "20 Lectures"
            }
        ];

        let activeCourseId = "calculus-1";

        function findCourseByLectureUid(uid) {
            for (const c of COURSES) {
                if (c.lectures.some(l => l.uid === uid)) return c;
            }
            return COURSES[0];
        }

// Export bindings for modules and global namespace
export { CALCULUS_LECTURES, ALGEBRA_LECTURES, COURSES, findCourseByLectureUid };
window.CALCULUS_LECTURES = CALCULUS_LECTURES;
window.ALGEBRA_LECTURES = ALGEBRA_LECTURES;
window.COURSES = COURSES;
window.findCourseByLectureUid = findCourseByLectureUid;
