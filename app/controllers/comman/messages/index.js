import Chat from "../../../models/chatRoom/Chat.js";
import Message from "../../../models/chatRoom/Message.js";
import User from "../../../models/User.js";
import { sendSuccess , sendError } from "../../../utils/responseHandler.js";
import { CODES } from "../../../utils/statusCodes.js";

const messageController = {}

messageController.createMessage = async (req, res) => {
  const senderId = req.userId;
  const { chatId, receiverId, content } = req.body;

  if (!chatId || !receiverId || !content) {
    return sendError(res , {} ,"chatId, receiverId, and content are required" , CODES.BAD_REQUEST);
  }

  try {
    const chat = await Chat.findOne({
      _id: chatId,
      participants: { $all: [senderId, receiverId] },
    });

    if (!chat) {
      return sendError(res , {} ,"Chat not found between these users" , CODES.NOT_FOUND);
    }

    const message = new Message({
      chat: chatId,
      senderId: senderId,
      receiverId: receiverId,
      content: content,
    });

    await message.save();

    req.io.to(chatId).emit("receiveMessage", message);

    sendSuccess(res , {message} , "Message created successfully" , CODES.CREATED)
  } catch (err) {
    return sendError(res, err);
  }
};

messageController.getMessages = async (req, res) => {
  const { chatId } = req.params;

  if (!chatId) {
    return sendError(res , {} ,"chatId is required", CODES.BAD_REQUEST);
  }

  try {
    const messages = await Message.find({ chat: chatId })
      .populate("senderId", "name")
      .populate("receiverId", "name")
      .sort({ createdAt: 1 });

   sendSuccess(res , {messages} , "Message fetched successfully" , CODES.CREATED)
  } catch (err) {
    return sendError(res, err);
  }
};

messageController.readMessage = async (req, res) => {
  try {
    const messageId = req.params.messageId;
    const userId = req.userId;

    const message = await Message.findById(messageId);

    if (!message) {
      return sendError(res , {} ,'Message not found', CODES.NOT_FOUND);
    }

    if (message.receiverId.toString() !== userId.toString()) {
      return sendError(res , {} ,'You are not authorized to read this message', CODES.UNAUTHORIZED);
    }

    message.read = true;
    await message.save();

    sendSuccess(res , {message} , 'Message marked as read' , CODES.OK)
  } catch (err) {
    return sendError(res, err);
  }
}       
   
export default messageController;
