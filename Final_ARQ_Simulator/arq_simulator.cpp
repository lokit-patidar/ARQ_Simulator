// Generalized ARQ Protocol Simulator
// Stop-and-Wait, Go-Back-N, and Selective Repeat
// This version uses functions and shared variables instead of protocol classes.

#include <iostream>
#include <iomanip>
#include <string>
#include <vector>
#include <queue>
#include <set>
#include <sstream>
#include <limits>
#include <cctype>

using namespace std;

const double FRAME_TIME = 1.0;
const double PROP_DELAY = 2.0;
const double TIMEOUT_TIME = 8.0;

const int STOP_AND_WAIT = 1;
const int GO_BACK_N = 2;
const int SELECTIVE_REPEAT = 3;

const int SENDER_FREE = 0;
const int FRAME_ARRIVE = 1;
const int ACK_ARRIVE = 2;
const int TIMER_EXPIRE = 3;

struct Config {
    int protocol;
    int totalFrames;
    int seqBits;
    int senderWindow;
    int receiverWindow;
    set<int> lostFrames;
    set<int> lostAcks;
};

struct Stats {
    int delivered = 0;
    int attempts = 0;
    int retransmissions = 0;
    int discarded = 0;
    int framesLost = 0;
    int acksLost = 0;
    int acksGenerated = 0;
    int timeouts = 0;
    double time = 0;
};

struct Event {
    double time;
    long long order;
    int type;
    int frame;
    long long timerToken;
};

struct EventLater {
    bool operator()(const Event& a, const Event& b) const {
        if (a.time != b.time) return a.time > b.time;
        return a.order > b.order;
    }
};

Config config;
Stats stats;
priority_queue<Event, vector<Event>, EventLater> events;
vector<int> frameAttempts;
vector<int> ackAttempts;
vector<long long> timerTokens;

int sequenceSpace;
double currentTime = 0;
double senderFreeAt = 0;
long long eventOrder = 0;
long long nextTimerToken = 0;
int nextFrameToDeliver = 0;
bool integrityOk = true;
bool completed = false;
bool stalled = false;

// Stop-and-Wait variables
int swCurrent = 0;
int swExpected = 0;
bool swWaiting = false;
bool swNeedsRetransmission = false;

// Go-Back-N variables
int gbnBase = 0;
int gbnNextToSend = 0;
int gbnExpected = 0;

// Selective Repeat variables
int srBase = 0;
int srNextToSend = 0;
int srReceiverBase = 0;
vector<int> srAcked;
vector<int> srReceived;
queue<int> srRetransmissionQueue;

void addEvent(int type, double time, int frame = -1, long long token = 0) {
    Event event = {time, eventOrder++, type, frame, token};
    events.push(event);
}

string frameName(int frame) {
    return "Frame " + to_string(frame);
}

string ackName(int frame) {
    return "ACK " + to_string(frame);
}

string sequenceText(int frame) {
    return " (seq " + to_string(frame % sequenceSpace) + ")";
}

void say(const string& message) {
    cout << "[t =" << setw(5) << fixed << setprecision(1) << currentTime
         << "] " << message << "\n";
}

bool senderIsBusy() {
    return currentTime < senderFreeAt;
}

void startTimer(int frame) {
    timerTokens[frame] = ++nextTimerToken;
    addEvent(TIMER_EXPIRE, currentTime + TIMEOUT_TIME, frame, timerTokens[frame]);
}

void stopTimer(int frame) {
    timerTokens[frame] = 0;
}

void sendFrame(int frame) {
    bool retransmission = frameAttempts[frame] > 0;
    bool isLost = !retransmission && config.lostFrames.count(frame) > 0;

    frameAttempts[frame]++;
    stats.attempts++;
    if (retransmission) stats.retransmissions++;

    say(frameName(frame) + (retransmission ? " retransmitted" : " transmitted")
        + sequenceText(frame));

    senderFreeAt = currentTime + FRAME_TIME;
    addEvent(SENDER_FREE, senderFreeAt);

    if (isLost) {
        stats.framesLost++;
        say("Frame loss detected: " + frameName(frame) + " lost in the channel");
    } else {
        addEvent(FRAME_ARRIVE, currentTime + FRAME_TIME + PROP_DELAY, frame);
    }
}

void sendAck(int frame, const string& note = "") {
    bool isLost = ackAttempts[frame] == 0 && config.lostAcks.count(frame) > 0;
    ackAttempts[frame]++;
    stats.acksGenerated++;

    say(ackName(frame) + " generated" + sequenceText(frame)
        + (note.empty() ? "" : " - " + note));

    if (isLost) {
        stats.acksLost++;
        say("ACK loss detected: " + ackName(frame) + " lost in the channel");
    } else {
        addEvent(ACK_ARRIVE, currentTime + PROP_DELAY, frame);
    }
}

void deliverFrame(int frame) {
    if (frame != nextFrameToDeliver){
        integrityOk = false;
        return;
    } 
    nextFrameToDeliver++;
    stats.delivered++;
}

void discardFrame(int frame, const string& reason) {
    stats.discarded++;
    say(frameName(frame) + " discarded (" + reason + ")");
}

bool protocolFinished() {
    if (config.protocol == STOP_AND_WAIT) return swCurrent >= config.totalFrames;
    if (config.protocol == GO_BACK_N) return gbnBase >= config.totalFrames;
    return srBase >= config.totalFrames;
}

void trySend() {
    if (senderIsBusy()) return;

    if (config.protocol == STOP_AND_WAIT) {
        if (swNeedsRetransmission) {
            swNeedsRetransmission = false;
            sendFrame(swCurrent);
            startTimer(swCurrent);
        } 
        else if (!swWaiting && swCurrent < config.totalFrames) {
            swWaiting = true;
            sendFrame(swCurrent);
            startTimer(swCurrent);
        }
    } 
    else if (config.protocol == GO_BACK_N) {
        if (gbnNextToSend < config.totalFrames &&
            gbnNextToSend < gbnBase + config.senderWindow) {
            int frame = gbnNextToSend;
            gbnNextToSend++;
            sendFrame(frame);
            // Each sent frame has a timer; only the base timer triggers recovery.
            startTimer(frame);
        }
    } 
    else {
        while (!srRetransmissionQueue.empty()) {
            int frame = srRetransmissionQueue.front();
            srRetransmissionQueue.pop();
            if (!srAcked[frame]) {
                sendFrame(frame);
                startTimer(frame);
                return;
            }
        }

        if (srNextToSend < config.totalFrames &&
            srNextToSend < srBase + config.senderWindow) {
            int frame = srNextToSend;
            srNextToSend++;
            sendFrame(frame);
            startTimer(frame);
        }
    }
}

void receiveFrame(int frame) {
    if (config.protocol == STOP_AND_WAIT) {
        if (frame == swExpected) {
            say(frameName(frame) + " received successfully");
            deliverFrame(frame);
            swExpected++;
            sendAck(frame);
        } 
        else if (frame < swExpected) {
            discardFrame(frame, "duplicate frame");
            sendAck(frame, "re-sent for duplicate frame");
        } 
        else {
            discardFrame(frame, "unexpected frame");
        }
    } 
    else if (config.protocol == GO_BACK_N) {
        if (frame == gbnExpected) {
            say(frameName(frame) + " received successfully");
            deliverFrame(frame);
            gbnExpected++;
            sendAck(frame, "cumulative");
        } 
        else {
            discardFrame(frame, frame < gbnExpected ? "duplicate frame" : "out-of-order frame");
            if (gbnExpected > 0)
                sendAck(gbnExpected - 1, "cumulative, last in-order frame");
        }
    } 
    else {
        int receiverWindow = config.receiverWindow;
        if (frame >= srReceiverBase && frame < srReceiverBase + receiverWindow) {
            if (srReceived[frame]) {
                discardFrame(frame, "duplicate frame already buffered");
                sendAck(frame, "re-sent for duplicate frame");
            } 
            else {
                srReceived[frame] = 1;
                if (frame == srReceiverBase)
                    say(frameName(frame) + " received successfully");
                else
                    say(frameName(frame) + " received out of order, buffered in receiver window");
                sendAck(frame);

                while (srReceiverBase < config.totalFrames && srReceived[srReceiverBase]) {
                    if (srReceiverBase != frame)
                        say(frameName(srReceiverBase) + " delivered in order from the receiver buffer");
                    deliverFrame(srReceiverBase);
                    srReceiverBase++;
                }
            }
        } 
        else if (frame < srReceiverBase) {
            discardFrame(frame, "duplicate frame already delivered");
            sendAck(frame, "re-sent for duplicate frame");
        } 
        else {
            discardFrame(frame, "outside receiver window");
        }
    }
}

void receiveAck(int frame) {
    say(ackName(frame) + " received by sender");

    if (config.protocol == STOP_AND_WAIT) {
        if (swWaiting && frame == swCurrent) {
            stopTimer(swCurrent);
            swWaiting = false;
            swNeedsRetransmission = false;
            swCurrent++;
            trySend();
        } 
        else {
            say("Duplicate/old ACK ignored");
        }
    } 
    else if (config.protocol == GO_BACK_N) {
        if (frame >= gbnBase) {
            if (frame > gbnBase) {
                say("Cumulative ACK: frames " + to_string(gbnBase) + " to "
                    + to_string(frame) + " acknowledged");
            }
            // Stop timers for every frame acknowledged by this cumulative ACK.
            for (int f = gbnBase; f <= frame; f++) stopTimer(f);
            gbnBase = frame + 1;
            if (gbnNextToSend < gbnBase) gbnNextToSend = gbnBase;
            if (gbnBase < config.totalFrames)
                say("Sender window slides: oldest unacknowledged frame is now "
                    + to_string(gbnBase));
        } 
        else {
            say("Duplicate/old ACK ignored");
        }
        trySend();
    } 
    else {
        if (frame < srBase || srAcked[frame]) {
            say("Duplicate/old ACK ignored");
        } 
        else {
            srAcked[frame] = 1;
            stopTimer(frame);
            int oldBase = srBase;
            while (srBase < config.totalFrames && srAcked[srBase]) srBase++;
            if (srBase != oldBase && srBase < config.totalFrames) {
                say("Sender window slides: oldest unacknowledged frame is now "
                    + to_string(srBase));
            }
        }
        trySend();
    }
}

void handleTimeout(int frame) {
    if (config.protocol == STOP_AND_WAIT) {
        if (swWaiting && frame == swCurrent) {
            say("Timeout occurred for " + frameName(swCurrent));
            say("Retransmitting current unacknowledged frame (" + frameName(swCurrent) + ")");
            swNeedsRetransmission = true;
            trySend();
        }
    } 
    else if (config.protocol == GO_BACK_N) {
        // Only the oldest unacknowledged frame can start Go-Back-N recovery.
        if (frame != gbnBase) return;
        say("Timeout occurred for " + frameName(frame) + " (oldest unacknowledged frame)");
        say("Retransmitting outstanding frames (Frame " + to_string(gbnBase)
            + " to Frame " + to_string(gbnNextToSend - 1) + ")");
        // Cancel all window timers before retransmitting the outstanding frames.
        for (int f = gbnBase; f < gbnNextToSend; f++) stopTimer(f);
        gbnNextToSend = gbnBase;
        trySend();
    } 
    else {
        if (srAcked[frame]) return;
        say("Timeout occurred for " + frameName(frame));
        say("Retransmitting only the timed-out unacknowledged frame (" + frameName(frame) + ")");
        srRetransmissionQueue.push(frame);
        trySend();
    }
}

void runSimulation() {
    cout << "\n========== TRANSMISSION LOG ==========\n";
    if (config.protocol == STOP_AND_WAIT) cout << "Protocol: Stop-and-Wait\n";
    else if (config.protocol == GO_BACK_N) cout << "Protocol: Go-Back-N\n";
    else cout << "Protocol: Selective Repeat\n";

    currentTime = 0;
    trySend();
    long long processedEvents = 0;

    while (!protocolFinished() && !events.empty()) {
        if (++processedEvents > 1000000) {
            stalled = true;
            break;
        }

        Event event = events.top();
        events.pop();
        currentTime = event.time;

        if (event.type == SENDER_FREE) {
            trySend();
        } 
        else if (event.type == FRAME_ARRIVE) {
            receiveFrame(event.frame);
        } 
        else if (event.type == ACK_ARRIVE) {
            receiveAck(event.frame);
        } 
        else if (event.type == TIMER_EXPIRE &&
                   event.timerToken != 0 &&
                   timerTokens[event.frame] == event.timerToken) {
            timerTokens[event.frame] = 0;
            stats.timeouts++;
            handleTimeout(event.frame);
        }
    }

    completed = protocolFinished();
    if (!completed) stalled = true;
    stats.time = currentTime;
}

bool integrityPassed() {
    return completed && integrityOk && stats.delivered == config.totalFrames &&
           nextFrameToDeliver == config.totalFrames;
}

void printSummary() {
    cout << "\n========== PERFORMANCE SUMMARY ==========\n";
    cout << "Successfully delivered frames: " << stats.delivered << "\n";
    cout << "Total transmission attempts: " << stats.attempts << "\n";
    cout << "Total retransmissions: " << stats.retransmissions << "\n";
    cout << "Total frames discarded: " << stats.discarded << "\n";
    cout << "Total simulated time: " << fixed << setprecision(1)
         << stats.time << " time units\n";
    cout << "\nAdditional statistics:\n";
    cout << "Configuration: " << config.totalFrames << " frames, " << config.seqBits
         << " sequence bits (numbers 0 to " << sequenceSpace - 1
         << "), sender window " << config.senderWindow
         << ", receiver window " << config.receiverWindow << "\n";
    cout << "Timing model (time units): frame transmission = " << FRAME_TIME
         << ", propagation delay = " << PROP_DELAY
         << ", timeout = " << TIMEOUT_TIME << "\n";
    cout << "Data frames lost in channel: " << stats.framesLost << "\n";
    cout << "ACKs generated: " << stats.acksGenerated
         << " (lost in channel: " << stats.acksLost << ")\n";
    cout << "Timeouts: " << stats.timeouts << "\n";
    if (stalled)
        cout << "WARNING: the simulation stalled before all frames were acknowledged.\n";
    cout << "Integrity check (all frames delivered in order, exactly once): "
         << (integrityPassed() ? "PASSED" : "FAILED") << "\n";
}

bool parseWholeNumber(const string& text, long long& value);

long long readNumber(const string& prompt, long long low, long long high,
                     const string& rangeMessage) {
    long long value;
    string line;
    while (true) {
        cout << prompt;
        if (!getline(cin, line)) {
            cout << "\nInput ended unexpectedly. Exiting.\n";
            exit(1);
        }
        if (!parseWholeNumber(line, value)) {
            cout << "Invalid input: please enter a whole number.\n";
            continue;
        }
        if (value < low || value > high) {
            cout << rangeMessage << "\n";
            continue;
        }
        return value;
    }
}

bool parseWholeNumber(const string& text, long long& value) {
    stringstream input(text);
    char extra;
    if (!(input >> value)) return false;
    if (input >> extra) return false;
    return true;
}

set<int> readList(const string& prompt, int frameCount) {
    while (true) {
        cout << prompt;
        string line;
        getline(cin, line);
        for (int i = 0; i < (int)line.size(); i++) {
            if (line[i] == ',') line[i] = ' ';
        }

        stringstream input(line);
        string item;
        set<int> result;
        bool valid = true;

        while (input >> item) {
            string lowerItem = item;
            for (int i = 0; i < (int)lowerItem.size(); i++)
                lowerItem[i] = (char)tolower((unsigned char)lowerItem[i]);
            if (lowerItem == "none" || item == "-") continue;

            long long frame;
            if (!parseWholeNumber(item, frame) || frame < 0 || frame >= frameCount) {
                cout << "Invalid entry '" << item << "': numbers must be whole numbers from 0 to "
                     << frameCount - 1 << ".\n";
                valid = false;
                break;
            }
            result.insert((int)frame);
        }
        if (valid) return result;
    }
}

int main() {
    cout << "========== GENERALIZED ARQ SIMULATOR ==========\n\n";
    cout << "Select ARQ Protocol:\n";
    cout << "1. Stop-and-Wait\n";
    cout << "2. Go-Back-N\n";
    cout << "3. Selective Repeat\n\n";

    config.protocol = (int)readNumber("Enter your choice: ", 1, 3,
                                      "Invalid choice: please enter 1, 2 or 3.");
    cout << "\n";

    config.totalFrames = (int)readNumber("Enter total number of frames: ", 1, 100000,
        "Invalid: total number of frames must be between 1 and 100000.");
    config.seqBits = (int)readNumber("Enter sequence number bits: ", 1, 16,
        "Invalid: sequence number bits must be between 1 and 16.");

    long long space = 1LL << config.seqBits;
    string bits = to_string(config.seqBits);

    if (config.protocol == STOP_AND_WAIT) {
        config.senderWindow = 1;
        config.receiverWindow = 1;
    } else if (config.protocol == GO_BACK_N) {
        long long maxWindow = space - 1;
        config.senderWindow = (int)readNumber("Enter sender window size: ", 1, maxWindow,
            "Invalid configuration: Go-Back-N sender window must be between 1 and " +
            to_string(maxWindow) + " (2^m - 1, m = " + bits + ").");
        config.receiverWindow = 1;
    } else {
        long long maxWindow = space / 2;
        config.senderWindow = (int)readNumber("Enter sender window size: ", 1, maxWindow,
            "Invalid configuration: Selective Repeat sender window must be between 1 and " +
            to_string(maxWindow) + " (2^(m-1), half of the sequence number space, m = " +
            bits + ").");
        config.receiverWindow = (int)readNumber("Enter receiver window size: ", 1, maxWindow,
            "Invalid configuration: Selective Repeat receiver window must be between 1 and " +
            to_string(maxWindow) + " (2^(m-1), half of the sequence number space, m = " +
            bits + ").");
    }

    cout << "\nConfigure channel errors:\n";
    config.lostFrames = readList("Enter frame numbers to be lost: ", config.totalFrames);
    config.lostAcks = readList("Enter ACK numbers to be lost: ", config.totalFrames);

    sequenceSpace = 1LL << config.seqBits;
    frameAttempts.assign(config.totalFrames, 0);
    ackAttempts.assign(config.totalFrames, 0);
    timerTokens.assign(config.totalFrames, 0);
    srAcked.assign(config.totalFrames, 0);
    srReceived.assign(config.totalFrames, 0);

    runSimulation();
    printSummary();
    return 0;
}



